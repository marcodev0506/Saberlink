import amqp from 'amqplib';
import pg from 'pg';
import { readFile } from 'fs/promises';
import AdmZip from 'adm-zip';

const QUEUE = 'ia.jobs';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2:1b';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function callOllama(prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  return (await res.json()).response;
}

function extractPdfText(buffer) {
  // Extracción básica de texto de un PDF (stream literal) — suficiente para PDFs de texto simples
  const src = buffer.toString('latin1');
  const chunks = [];
  const re = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  let m;
  while ((m = re.exec(src))) chunks.push(m[1]);
  const arr = /\[((?:[^\]]*))\]\s*TJ/g;
  while ((m = arr.exec(src))) {
    const inner = m[1].match(/\(((?:[^()\\]|\\.)*)\)/g) ?? [];
    chunks.push(inner.map((s) => s.slice(1, -1)).join(''));
  }
  return chunks.join(' ').replace(/\\([()\\])/g, '$1').slice(0, 15000);
}

function parseJsonSecciones(text) {
  const m = text.match(/\{[\s\S]*\}/);
  let j = {};
  try { j = JSON.parse(m ? m[0] : '{}'); } catch { /* sin JSON */ }
  const secciones = Array.isArray(j.secciones) && j.secciones.length
    ? j.secciones.map((s, i) => ({ titulo: String(s.titulo ?? `Unidad ${i + 1}`), texto: String(s.texto ?? '') }))
    : [{ titulo: 'Unidad 1', texto: (j.guion ?? text).slice(0, 4000) }];
  return { secciones, evaluaciones: Array.isArray(j.evaluaciones) ? j.evaluaciones : [] };
}

function extractDocxText(buffer) {
  const zip = new AdmZip(buffer);
  const xml = zip.readAsText('word/document.xml');
  return xml
    .replace(/<w:p\b[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\[([^\]]*)\]/g, '')          // quita campos sin rellenar […]
    .replace(/\n{2,}/g, '\n')
    .slice(0, 15000);
}

// Divide la sección "2. Desarrollo del Contenido" de la plantilla en unidades
// completas (2.1, 2.2, ...), sin resumir. Objetivos (1), Actividades (3) y
// Recursos (4) no se usan como unidades.
function parsePlantillaSecciones(texto) {
  const ini = texto.search(/desarrollo del contenido/i);
  if (ini < 0) return null;
  const resto = texto.slice(ini);
  const fin = resto.search(/\n\s*\d*\.?\s*actividades/i);
  const desarrollo = fin > 0 ? resto.slice(0, fin) : resto;
  // divide en párrafos y reagrupa por subtítulos "2.x Título"
  const lines = desarrollo.split('\n').map((l) => l.trim()).filter(Boolean);
  const secciones = [];
  let actual = null;
  for (const line of lines.slice(1)) {            // salta la línea "2. Desarrollo…"
    const m = line.match(/^(\d+)\.(\d+)\s+(.+)/);
    if (m) {
      actual = { titulo: `${m[1]}.${m[2]} ${m[3]}`, texto: `${m[3]}\n` };
      secciones.push(actual);
    } else if (actual) {
      actual.texto += line + '\n';
    }
  }
  for (const s of secciones) s.texto = s.texto.trim();
  return secciones.length ? secciones : null;
}

async function procesarCurso({ curso_id, pdf_path }) {
  const buf = await readFile(pdf_path);
  const texto = pdf_path.endsWith('.docx')
    ? extractDocxText(buf)
    : (extractPdfText(buf) || 'PDF sin texto extraíble');

  let secciones = parsePlantillaSecciones(texto);
  console.log(`curso ${curso_id}: plantilla=${!!secciones}`);
  if (!secciones) console.log('inicio del texto extraído:', texto.slice(0, 400).replace(/\n/g, ' | '));
  let evaluaciones = [];

  const promptEvals =
    `Eres un diseñador instruccional. Genera 5 evaluaciones de opción múltiple sobre este contenido. ` +
    `Responde SOLO con JSON {"evaluaciones": [{"pregunta": "...", "opciones": ["a","b","c"], "correcta": 0}]}.\n\nContenido:\n${texto.slice(0, 12000)}`;

  if (secciones) {
    const out = await callOllama(promptEvals);
    const m = out.match(/\{[\s\S]*\}/);
    try { evaluaciones = JSON.parse(m ? m[0] : '{}').evaluaciones ?? []; } catch { /* sin JSON */ }
    if (!Array.isArray(evaluaciones)) evaluaciones = [];
  } else {
    const out = await callOllama(
      `Eres un diseñador instruccional. Divide este contenido de curso en unidades o temas. ` +
      `Responde SOLO con JSON {"secciones": [{"titulo": "Unidad 1: ...", "texto": "guion narrado de la unidad"}], ` +
      `"evaluaciones": [{"pregunta": "...", "opciones": ["a","b","c"], "correcta": 0}]}.\n\nContenido:\n${texto}`
    );
    ({ secciones, evaluaciones } = parseJsonSecciones(out));
  }
  const guion = secciones.map((s) => s.texto).join('\n\n');
  await pool.query(
    "UPDATE cursos SET guion = $1, evaluaciones = $2::jsonb, estado = 'listo' WHERE id = $3",
    [guion, JSON.stringify(evaluaciones), curso_id]
  );
  const ch = await getVoiceChannel();
  await ch.assertQueue('voice.jobs', { durable: true });
  for (const [i, s] of secciones.entries()) {
    const { rows: [l] } = await pool.query(
      'INSERT INTO lecciones (curso_id, orden, titulo, texto) VALUES ($1, $2, $3, $4) RETURNING id',
      [curso_id, i + 1, s.titulo, s.texto]
    );
    ch.sendToQueue('voice.jobs', Buffer.from(JSON.stringify({
      type: 'tts', payload: { curso_id, leccion_id: l.id, guion: s.texto },
    })));
  }
  console.log(`curso ${curso_id}: ${secciones.length} unidades + ${evaluaciones.length} evaluaciones`);
}

let voiceConn;
async function getVoiceChannel() {
  if (!voiceConn) {
    const conn = await amqp.connect(process.env.RABBITMQ_URL);
    voiceConn = await conn.createChannel();
  }
  return voiceConn;
}

async function main() {
  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertQueue(QUEUE, { durable: true });
  ch.prefetch(1);
  console.log(`ia-worker waiting on ${QUEUE}`);

  ch.consume(QUEUE, async (msg) => {
    try {
      const job = JSON.parse(msg.content.toString());
      if (job.payload?.curso_id && job.payload?.pdf_path) {
        await procesarCurso(job.payload);
      } else {
        const guion = await callOllama(`Genera un guion de lección a partir de: ${JSON.stringify(job.payload)}`);
        console.log('guion generado:', guion.slice(0, 120));
      }
      ch.ack(msg);
    } catch (err) {
      console.error('job failed:', err.message);
      ch.nack(msg, false, false);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
