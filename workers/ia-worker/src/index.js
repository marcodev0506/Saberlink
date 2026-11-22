import amqp from 'amqplib';

const QUEUE = 'ia.jobs';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2:1b';

async function callOllama(prompt) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  return (await res.json()).response;
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
      // TODO: extraer texto del PDF, pedir a Ollama el guion + exámenes en JSON,
      // persistir en Postgres (JSONB) y encolar job de voz.
      const guion = await callOllama(`Genera un guion de lección a partir de: ${JSON.stringify(job.payload)}`);
      console.log('guion generado:', guion.slice(0, 120));
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
