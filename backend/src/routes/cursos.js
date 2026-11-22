import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from './auth.js';
import { publish } from '../queue.js';
import { mkdir, writeFile } from 'fs/promises';

const router = Router();
router.use(requireAuth);

const puedeEditar = (rol) => rol === 'rrhh' || rol === 'experto';

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.titulo, c.objetivo, c.estado, c.competencias, c.audio_path,
            c.facilitador_id, u.nombre AS facilitador
     FROM cursos c LEFT JOIN usuarios u ON u.id = c.facilitador_id
     WHERE c.empresa_id = $1 ORDER BY c.created_at DESC`, [req.user.empresa_id]
  );
  res.json({ cursos: rows });
});

router.post('/', async (req, res) => {
  if (!puedeEditar(req.user.rol)) return res.status(403).json({ error: 'Solo RRHH o Experto' });
  const { titulo, objetivo, facilitador_id, competencias, pdf_base64, pdf_nombre } = req.body ?? {};
  if (!titulo?.trim()) return res.status(400).json({ error: 'Falta el título' });
  if (facilitador_id) {
    const { rows: [fac] } = await pool.query(
      "SELECT id FROM usuarios WHERE id = $1 AND empresa_id = $2 AND rol = 'experto'",
      [facilitador_id, req.user.empresa_id]
    );
    if (!fac) return res.status(404).json({ error: 'Facilitador no encontrado' });
  }

  const { rows: [c] } = await pool.query(
    `INSERT INTO cursos (empresa_id, titulo, objetivo, facilitador_id, competencias)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id, titulo, objetivo, estado`,
    [req.user.empresa_id, titulo.trim(), objetivo ?? '', facilitador_id || null,
     JSON.stringify(competencias ?? [])]
  );

  if (pdf_base64) {
    const dir = `${process.env.STORAGE_DIR}/pdfs`;
    await mkdir(dir, { recursive: true });
    const path = `${dir}/${c.id}.pdf`;
    const clean = pdf_base64.replace(/^data:.*;base64,/, '');
    await writeFile(path, Buffer.from(clean, 'base64'));
    await pool.query("UPDATE cursos SET pdf_path = $1, estado = 'procesando' WHERE id = $2", [path, c.id]);
    await publish('ia.jobs', { type: 'guion', payload: { curso_id: c.id, pdf_path: path, empresa_id: req.user.empresa_id } });
    c.estado = 'procesando';
  }
  res.status(201).json({ curso: c });
});

router.put('/:id', async (req, res) => {
  if (!puedeEditar(req.user.rol)) return res.status(403).json({ error: 'Solo RRHH o Experto' });
  const { titulo, objetivo, facilitador_id, competencias, estado } = req.body ?? {};
  const { rows: [c] } = await pool.query(
    `UPDATE cursos SET
       titulo = COALESCE($3, titulo),
       objetivo = COALESCE($4, objetivo),
       facilitador_id = COALESCE($5, facilitador_id),
       competencias = COALESCE($6, competencias),
       estado = COALESCE($7, estado)
     WHERE id = $1 AND empresa_id = $2 RETURNING id, titulo, objetivo, estado`,
    [req.params.id, req.user.empresa_id, titulo ?? null, objetivo ?? null,
     facilitador_id ?? null, competencias != null ? JSON.stringify(competencias) : null, estado ?? null]
  );
  if (!c) return res.status(404).json({ error: 'Curso no encontrado' });
  res.json({ curso: c });
});

router.delete('/:id', async (req, res) => {
  if (!puedeEditar(req.user.rol)) return res.status(403).json({ error: 'Solo RRHH o Experto' });
  const { rowCount } = await pool.query(
    'DELETE FROM cursos WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Curso no encontrado' });
  res.json({ deleted: true });
});

export default router;
