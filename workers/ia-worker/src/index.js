import amqp from 'amqplib';
import pg from 'pg';
import { readFile } from 'fs/promises';

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

async function procesarCurso({ curso_id, pdf_path }) {
  const buf = await readFile(pdf_path);
  const texto = extractPdfText(buf) || 'PDF sin texto extraíble';
  const out = await callOllama(
    `Eres un diseñador instruccional. Divide este contenido de curso en unidades o temas. ` +
    `Responde SOLO con JSON {"secciones": [{"titulo": "Unidad 1: ...", "texto": "guion narrado de la unidad"}], ` +
    `"evaluaciones": [{"pregunta": "...", "opciones": ["a","b","c"], "correcta": 0}]}.\n\nContenido:\n${texto}`
  );
  const { secciones, evaluaciones } = parseJsonSecciones(out);
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
