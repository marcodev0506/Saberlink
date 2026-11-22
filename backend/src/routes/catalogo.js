import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from './auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, tipo, nombre FROM catalogo WHERE empresa_id = $1 ORDER BY nombre',
    [req.user.empresa_id]
  );
  res.json({ items: rows });
});

router.post('/', async (req, res) => {
  const { tipo, nombre } = req.body ?? {};
  if (!['competencia', 'habilidad'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
  if (!nombre?.trim()) return res.status(400).json({ error: 'Falta el nombre' });
  const { rows: [item] } = await pool.query(
    `INSERT INTO catalogo (empresa_id, tipo, nombre) VALUES ($1, $2, $3)
     ON CONFLICT (empresa_id, tipo, nombre) DO UPDATE SET nombre = EXCLUDED.nombre
     RETURNING id, tipo, nombre`,
    [req.user.empresa_id, tipo, nombre.trim()]
  );
  res.status(201).json({ item });
});

export default router;
