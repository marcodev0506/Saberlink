import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from './auth.js';

const router = Router();
router.use(requireAuth);

function requireRrhh(req, res, next) {
  if (req.user.rol !== 'rrhh') return res.status(403).json({ error: 'Solo RRHH puede editar la estructura' });
  next();
}

// Devuelve el árbol completo de la empresa
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, parent_id, nombre, tipo, orden, metadata FROM unidades
     WHERE empresa_id = $1 ORDER BY orden, nombre`, [req.user.empresa_id]
  );
  const byParent = new Map();
  for (const u of rows) {
    const key = u.parent_id ?? 'root';
    byParent.set(key, [...(byParent.get(key) ?? []), u]);
  }
  const build = (parentKey) =>
    (byParent.get(parentKey) ?? []).map((u) => ({ ...u, hijos: build(u.id) }));
  res.json({ unidades: build('root') });
});

router.post('/', requireRrhh, async (req, res) => {
  const { nombre, tipo, parent_id, orden, metadata } = req.body ?? {};
  if (!nombre?.trim()) return res.status(400).json({ error: 'Falta el nombre' });
  if (parent_id) {
    const { rows: [parent] } = await pool.query(
      'SELECT id FROM unidades WHERE id = $1 AND empresa_id = $2', [parent_id, req.user.empresa_id]
    );
    if (!parent) return res.status(404).json({ error: 'Unidad padre no encontrada' });
  }
  const { rows: [u] } = await pool.query(
    `INSERT INTO unidades (empresa_id, parent_id, nombre, tipo, orden, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, parent_id, nombre, tipo, orden, metadata`,
    [req.user.empresa_id, parent_id || null, nombre.trim(), tipo?.trim() || 'unidad', orden ?? 0, metadata ?? {}]
  );
  res.status(201).json({ unidad: u });
});

router.put('/:id', requireRrhh, async (req, res) => {
  const { nombre, tipo, orden, metadata } = req.body ?? {};
  const { rows: [u] } = await pool.query(
    `UPDATE unidades SET
       nombre   = COALESCE($3, nombre),
       tipo     = COALESCE($4, tipo),
       orden    = COALESCE($5, orden),
       metadata = COALESCE($6, metadata)
     WHERE id = $1 AND empresa_id = $2
     RETURNING id, parent_id, nombre, tipo, orden, metadata`,
    [req.params.id, req.user.empresa_id, nombre?.trim() ?? null, tipo?.trim() ?? null, orden ?? null, metadata ?? null]
  );
  if (!u) return res.status(404).json({ error: 'Unidad no encontrada' });
  res.json({ unidad: u });
});

router.delete('/:id', requireRrhh, async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM unidades WHERE id = $1 AND empresa_id = $2', [req.params.id, req.user.empresa_id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Unidad no encontrada' });
  res.json({ deleted: true });
});

export default router;
