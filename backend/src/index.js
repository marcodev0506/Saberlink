import express from 'express';
import { pool } from './db.js';
import { publish } from './queue.js';
import { migrate } from './migrate.js';
import authRouter from './routes/auth.js';
import usuariosRouter from './routes/usuarios.js';
import unidadesRouter from './routes/unidades.js';
import cursosRouter from './routes/cursos.js';
import catalogoRouter from './routes/catalogo.js';

const app = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use('/api/auth', authRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/unidades', unidadesRouter);
app.use('/api/cursos', cursosRouter);
app.use('/api/catalogo', catalogoRouter);

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

// Prueba de voz: texto corto -> mp3 directo (verifica ELEVENLABS_API_KEY)
app.get('/api/voz/test', async (req, res) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(503).json({ error: 'Falta ELEVENLABS_API_KEY en .env' });
  const voice = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: 'Bienvenido a Saberlink. Tu plataforma de acreditación corporativa.', model_id: 'eleven_multilingual_v2' }),
  });
  if (!r.ok) return res.status(r.status).json({ error: `ElevenLabs ${r.status}` });
  res.set('Content-Type', 'audio/mpeg');
  res.send(Buffer.from(await r.arrayBuffer()));
});

// Stub: enqueue a TTS job (Worker 2: Voz) — guion -> .mp3
app.post('/api/jobs/voz', async (req, res) => {
  const job = { type: 'tts', payload: req.body, createdAt: new Date().toISOString() };
  await publish('voice.jobs', job);
  res.status(202).json({ queued: true, job });
});

const port = process.env.PORT || 3000;
migrate()
  .then(() => app.listen(port, () => console.log(`API listening on :${port}`)))
  .catch((err) => {
    console.error('migration failed:', err);
    process.exit(1);
  });
