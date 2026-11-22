import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from './auth.js';
import { publish } from '../queue.js';
import { mkdir, writeFile } from 'fs/promises';

const router = Router();
router.use(requireAuth);

const puedeEditar = (rol) => rol === 'rrhh' || rol === 'gestor_curso';

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.titulo, c.objetivo, c.estado, c.competencias, c.habilidades, c.audio_path,
            c.imagen_path, c.duracion, c.facilitador_id, u.nombre AS facilitador
     FROM cursos c LEFT JOIN usuarios u ON u.id = c.facilitador_id
     WHERE c.empresa_id = $1 ORDER BY c.created_at DESC`, [req.user.empresa_id]
  );
  res.json({ cursos: rows });
});

// Resultados de evaluaciones de toda la empresa (para el menú Evaluaciones)
// IMPORTANTE: debe ir antes de '/:id' para que Express no lo confunda con un id.
router.get('/resultados', async (req, res) => {
  if (!puedeEditar(req.user.rol)) return res.status(403).json({ error: 'Solo RRHH o Gestor de curso' });
  const { rows } = await pool.query(
    `SELECT i.id, i.puntaje, i.total, i.aprobado, i.tipo, i.created_at,
            u.nombre AS estudiante, u.id AS usuario_id,
            c.titulo AS curso, c.id AS curso_id, ce.codigo AS certificado
     FROM intentos i
     JOIN usuarios u ON u.id = i.usuario_id
     JOIN cursos c ON c.id = i.curso_id
     LEFT JOIN certificados ce ON ce.curso_id = i.curso_id AND ce.usuario_id = i.usuario_id
     WHERE c.empresa_id = $1
     ORDER BY i.created_at DESC`,
    [req.user.empresa_id]
  );
  res.json({ resultados: rows });
});

router.get('/:id', async (req, res) => {
  const { rows: [c] } = await pool.query(
    `SELECT c.id, c.titulo, c.objetivo, c.estado, c.evaluaciones, c.guion, c.imagen_path, u.nombre AS facilitador
     FROM cursos c LEFT JOIN usuarios u ON u.id = c.facilitador_id
     WHERE c.id = $1 AND c.empresa_id = $2`, [req.params.id, req.user.empresa_id]
  );
  if (!c) return res.status(404).json({ error: 'Curso no encontrado' });
  const { rows: lecciones } = await pool.query(
    'SELECT id, orden, titulo, texto, audio_path FROM lecciones WHERE curso_id = $1 ORDER BY orden',
    [c.id]
  );
  res.json({ curso: c, lecciones });
});

router.get('/:id/imagen', async (req, res) => {
  const { rows: [c] } = await pool.query(
    'SELECT imagen_path FROM cursos WHERE id = $1 AND empresa_id = $2',
    [req.params.id, req.user.empresa_id]
  );
  if (!c?.imagen_path) return res.status(404).json({ error: 'Sin imagen' });
  res.sendFile(c.imagen_path);
});

// Genera el audio de una lección bajo demanda (ElevenLabs)
router.post('/:id/audio/:leccionId', async (req, res) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(503).json({ error: 'Falta ELEVENLABS_API_KEY en .env' });
  const { rows: [l] } = await pool.query(
    `SELECT l.id, l.texto FROM lecciones l JOIN cursos c ON c.id = l.curso_id
     WHERE l.id = $1 AND c.id = $2 AND c.empresa_id = $3`,
    [req.params.leccionId, req.params.id, req.user.empresa_id]
  );
  if (!l) return res.status(404).json({ error: 'Lección no encontrada' });
  const texto = `${l.titulo ?? ''}\n${l.texto}`.slice(0, 4500);
  const voice = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texto, model_id: 'eleven_multilingual_v2' }),
  });
  if (!r.ok) return res.status(502).json({ error: `ElevenLabs ${r.status}` });
  const dir = `${process.env.STORAGE_DIR}/audios`;
  await mkdir(dir, { recursive: true });
  const path = `${dir}/${l.id}.mp3`;
  await writeFile(path, Buffer.from(await r.arrayBuffer()));
  await pool.query('UPDATE lecciones SET audio_path = $1 WHERE id = $2', [path, l.id]);
  res.json({ ok: true });
});

// Audio de una lección
router.get('/:id/audio/:leccionId', async (req, res) => {
  const { rows: [l] } = await pool.query(
    `SELECT l.audio_path FROM lecciones l JOIN cursos c ON c.id = l.curso_id
     WHERE l.id = $1 AND c.id = $2 AND c.empresa_id = $3`,
    [req.params.leccionId, req.params.id, req.user.empresa_id]
  );
  if (!l?.audio_path) return res.status(404).json({ error: 'Sin audio' });
  res.sendFile(l.audio_path);
});

router.post('/', async (req, res) => {
  if (!puedeEditar(req.user.rol)) return res.status(403).json({ error: 'Solo RRHH o Gestor de curso' });
  const { titulo, objetivo, duracion, facilitador_id, competencias, habilidades, archivo_base64, archivo_nombre, imagen_base64, imagen_nombre } = req.body ?? {};
  if (!titulo?.trim()) return res.status(400).json({ error: 'Falta el título' });
  if (facilitador_id) {
    const { rows: [fac] } = await pool.query(
      "SELECT id FROM usuarios WHERE id = $1 AND empresa_id = $2 AND rol = 'gestor_curso'",
      [facilitador_id, req.user.empresa_id]
    );
    if (!fac) return res.status(404).json({ error: 'Facilitador no encontrado' });
  }

  const { rows: [c] } = await pool.query(
    `INSERT INTO cursos (empresa_id, titulo, objetivo, facilitador_id, competencias, habilidades, duracion)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
     RETURNING id, titulo, objetivo, estado`,
    [req.user.empresa_id, titulo.trim(), objetivo ?? '', facilitador_id || null,
     JSON.stringify(competencias ?? []), JSON.stringify(habilidades ?? []), duracion ?? '']
  );

  if (archivo_base64) {
    const ext = (archivo_nombre || 'documento.pdf').split('.').pop().toLowerCase();
    if (!['pdf', 'docx'].includes(ext)) return res.status(400).json({ error: 'Solo PDF o DOCX' });
    const dir = `${process.env.STORAGE_DIR}/docs`;
    await mkdir(dir, { recursive: true });
    const path = `${dir}/${c.id}.${ext}`;
    const clean = archivo_base64.replace(/^data:.*;base64,/, '');
    await writeFile(path, Buffer.from(clean, 'base64'));
    await pool.query("UPDATE cursos SET pdf_path = $1, estado = 'procesando' WHERE id = $2", [path, c.id]);
    await publish('ia.jobs', { type: 'guion', payload: { curso_id: c.id, pdf_path: path, empresa_id: req.user.empresa_id } });
    c.estado = 'procesando';
  }
  if (imagen_base64) {
    const ext = (imagen_nombre || 'imagen.png').split('.').pop().toLowerCase();
    const dir = `${process.env.STORAGE_DIR}/imagenes`;
    await mkdir(dir, { recursive: true });
    const path = `${dir}/${c.id}.${ext}`;
    const clean = imagen_base64.replace(/^data:.*;base64,/, '');
    await writeFile(path, Buffer.from(clean, 'base64'));
    await pool.query('UPDATE cursos SET imagen_path = $1 WHERE id = $2', [path, c.id]);
  }
  res.status(201).json({ curso: c });
});

router.put('/:id', async (req, res) => {
  if (!puedeEditar(req.user.rol)) return res.status(403).json({ error: 'Solo RRHH o Gestor de curso' });
  const { titulo, objetivo, duracion, facilitador_id, competencias, habilidades, estado, imagen_base64, imagen_nombre, archivo_base64, archivo_nombre } = req.body ?? {};
  const { rows: [c] } = await pool.query(
    `UPDATE cursos SET
       titulo = COALESCE($3, titulo),
       objetivo = COALESCE($4, objetivo),
       facilitador_id = COALESCE($5, facilitador_id),
       competencias = COALESCE($6, competencias),
       habilidades = COALESCE($8, habilidades),
       estado = COALESCE($7, estado),
       duracion = COALESCE($9, duracion)
     WHERE id = $1 AND empresa_id = $2 RETURNING id, titulo, objetivo, estado`,
    [req.params.id, req.user.empresa_id, titulo ?? null, objetivo ?? null,
     facilitador_id || null, competencias != null ? JSON.stringify(competencias) : null, estado ?? null,
     habilidades != null ? JSON.stringify(habilidades) : null, duracion ?? null]
  );
  if (!c) return res.status(404).json({ error: 'Curso no encontrado' });
  if (archivo_base64) {
    const ext = (archivo_nombre || 'documento.pdf').split('.').pop().toLowerCase();
    if (!['pdf', 'docx'].includes(ext)) return res.status(400).json({ error: 'Solo PDF o DOCX' });
    const dir = `${process.env.STORAGE_DIR}/docs`;
    await mkdir(dir, { recursive: true });
    const path = `${dir}/${c.id}.${ext}`;
    const clean = archivo_base64.replace(/^data:.*;base64,/, '');
    await writeFile(path, Buffer.from(clean, 'base64'));
    await pool.query('DELETE FROM lecciones WHERE curso_id = $1', [c.id]);
    await pool.query("UPDATE cursos SET pdf_path = $1, estado = 'procesando' WHERE id = $2", [path, c.id]);
    await publish('ia.jobs', { type: 'guion', payload: { curso_id: c.id, pdf_path: path, empresa_id: req.user.empresa_id } });
  }
  if (imagen_base64) {
    const ext = (imagen_nombre || 'imagen.png').split('.').pop().toLowerCase();
    const dir = `${process.env.STORAGE_DIR}/imagenes`;
    await mkdir(dir, { recursive: true });
    const path = `${dir}/${c.id}.${ext}`;
    const clean = imagen_base64.replace(/^data:.*;base64,/, '');
    await writeFile(path, Buffer.from(clean, 'base64'));
    await pool.query('UPDATE cursos SET imagen_path = $1 WHERE id = $2', [path, c.id]);
  }
  res.json({ curso: c });
});

// El trabajador presenta la evaluación y se guarda el intento
router.post('/:id/evaluacion', async (req, res) => {
  const { respuestas, tipo } = req.body ?? {};
  const t = ['diagnostico', 'teorica', 'practica'].includes(tipo) ? tipo : 'teorica';
  const { rows: [c] } = await pool.query(
    'SELECT id, evaluaciones FROM cursos WHERE id = $1 AND empresa_id = $2',
    [req.params.id, req.user.empresa_id]
  );
  if (!c) return res.status(404).json({ error: 'Curso no encontrado' });
  const evs = c.evaluaciones || [];
  const puntaje = evs.filter((e, i) => respuestas?.[String(i)] === e.correcta).length;
  const aprobado = evs.length > 0 && puntaje === evs.length;
  await pool.query(
    'INSERT INTO intentos (curso_id, usuario_id, respuestas, puntaje, total, aprobado, tipo) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)',
    [c.id, req.user.sub, JSON.stringify(respuestas ?? {}), puntaje, evs.length, aprobado, t]
  );
  let certificado = null;
  if (aprobado && t === 'teorica') {
    const { rows: [ce] } = await pool.query(
      `INSERT INTO certificados (empresa_id, curso_id, usuario_id, puntaje, total)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (curso_id, usuario_id) DO UPDATE SET puntaje = $4, total = $5
       RETURNING codigo`,
      [req.user.empresa_id, c.id, req.user.sub, puntaje, evs.length]
    );
    certificado = ce.codigo;
  }
  res.json({ puntaje, total: evs.length, aprobado, certificado });
});

router.get('/:id/intentos', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.puntaje, i.total, i.aprobado, i.created_at, u.nombre
     FROM intentos i JOIN usuarios u ON u.id = i.usuario_id WHERE i.curso_id = $1 ORDER BY i.created_at DESC`,
    [req.params.id]
  );
  res.json({ intentos: rows });
});

router.delete('/:id', async (req, res) => {
  if (!puedeEditar(req.user.rol)) return res.status(403).json({ error: 'Solo RRHH o Gestor de curso' });
  const { rowCount } = await pool.query(
    'DELETE FROM cursos WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Curso no encontrado' });
  res.json({ deleted: true });
});

export default router;
