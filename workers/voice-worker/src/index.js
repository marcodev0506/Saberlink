import amqp from 'amqplib';
import fs from 'node:fs/promises';
import pg from 'pg';

const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;

const QUEUE = 'voice.jobs';
const STORAGE_DIR = process.env.STORAGE_DIR || '/app/storage/audio';
const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

async function textToSpeech(text) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertQueue(QUEUE, { durable: true });
  ch.prefetch(1);
  console.log(`voice-worker waiting on ${QUEUE}`);

  ch.consume(QUEUE, async (msg) => {
    try {
      const job = JSON.parse(msg.content.toString());
      const audio = await textToSpeech(job.payload.guion ?? job.payload.text ?? '');
      const name = `${job.payload?.leccion_id ?? job.payload?.curso_id ?? Date.now()}.mp3`;
      await fs.mkdir(STORAGE_DIR, { recursive: true });
      await fs.writeFile(`${STORAGE_DIR}/${name}`, audio);
      const path = `${STORAGE_DIR}/${name}`;
      if (pool && job.payload?.leccion_id)
        await pool.query('UPDATE lecciones SET audio_path = $1 WHERE id = $2', [path, job.payload.leccion_id]);
      else if (pool && job.payload?.curso_id)
        await pool.query('UPDATE cursos SET audio_path = $1 WHERE id = $2', [path, job.payload.curso_id]);
      console.log(`audio saved: ${name}`);
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
