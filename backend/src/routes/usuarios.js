import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { requireAuth } from './auth.js';

const router = Router();
router.use(requireAuth);

function requireRrhh(req, res, next) {
  if (req.user.rol !== 'rrhh') return res.status(403).json({ error: 'Solo RRHH puede gestionar usuarios' });
  next();
}

router.get('/', requireRrhh, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nombre, email, rol, created_at FROM usuarios
     WHERE empresa_id = $1 ORDER BY created_at`, [req.user.empresa_id]
  );
  res.json({ usuarios: rows });
});

router.post('/', requireRrhh, async (req, res) => {
  const { nombre, email, password, rol } = req.body ?? {};
  if (!['experto', 'trabajador', 'rrhh'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Faltan campos' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows: [user] } = await pool.query(
      `INSERT INTO usuarios (empresa_id, email, password_hash, nombre, rol)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre, email, rol`,
      [req.user.empresa_id, email, hash, nombre, rol]
    );
    res.status(201).json({ usuario: user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email ya registrado' });
    throw err;
  }
});

export default router;
