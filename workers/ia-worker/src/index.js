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

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { guion: text.slice(0, 4000), evaluaciones: [] };
  try {
    const j = JSON.parse(m[0]);
    return { guion: String(j.guion ?? '').slice(0, 8000), evaluaciones: Array.isArray(j.evaluaciones) ? j.evaluaciones : [] };
  } catch {
    return { guion: text.slice(0, 4000), evaluaciones: [] };
  }
}

async function procesarCurso({ curso_id, pdf_path }) {
  const buf = await readFile(pdf_path);
  const texto = extractPdfText(buf) || 'PDF sin texto extraíble';
  const out = await callOllama(
    `Eres un diseñador instruccional. A partir de este contenido de un curso, responde SOLO con JSON ` +
    `{"guion": "guion narrado de la lección", "evaluaciones": [{"pregunta": "...", "opciones": ["a","b","c"], "correcta": 0}]}.\n\nContenido:\n${texto}`
  );
  const { guion, evaluaciones } = parseJson(out);
  await pool.query(
    "UPDATE cursos SET guion = $1, evaluaciones = $2::jsonb, estado = 'listo' WHERE id = $3",
    [guion, JSON.stringify(evaluaciones), curso_id]
  );
  const ch = await getVoiceChannel();
  await ch.assertQueue('voice.jobs', { durable: true });
  ch.sendToQueue('voice.jobs', Buffer.from(JSON.stringify({ type: 'tts', payload: { curso_id, guion } })));
  console.log(`curso ${curso_id}: guion + ${evaluaciones.length} evaluaciones generadas`);
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
