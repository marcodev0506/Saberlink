import express from 'express';
import { pool } from './db.js';
import { publish } from './queue.js';

const app = express();
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'db unreachable', error: err.message });
  }
});

// Stub: enqueue a script-generation job (Worker 1: IA) — PDF -> guion + examenes
app.post('/api/jobs/guion', async (req, res) => {
  const job = { type: 'guion', payload: req.body, createdAt: new Date().toISOString() };
  await publish('ia.jobs', job);
  res.status(202).json({ queued: true, job });
});

// Stub: enqueue a TTS job (Worker 2: Voz) — guion -> .mp3
app.post('/api/jobs/voz', async (req, res) => {
  const job = { type: 'tts', payload: req.body, createdAt: new Date().toISOString() };
  await publish('voice.jobs', job);
  res.status(202).json({ queued: true, job });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on :${port}`));
