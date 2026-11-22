import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const router = Router();
const RIF_RE = /^[JVEG]-?\d{8,9}$/i;

function sign(user, empresa) {
  return jwt.sign(
    { sub: user.id, empresa_id: user.empresa_id, rol: user.rol },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

// Crea empresa + primer usuario con rol 'rrhh'
router.post('/register-empresa', async (req, res) => {
  const { rif, empresa, nombre, email, password } = req.body ?? {};
  if (!rif || !RIF_RE.test(rif)) return res.status(400).json({ error: 'RIF inválido (formato J-12345678)' });
  if (!empresa || !nombre || !email || !password) return res.status(400).json({ error: 'Faltan campos' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rifNorm = rif.toUpperCase().replace('-', '');
    const { rows: [emp] } = await client.query(
      'INSERT INTO empresas (rif, nombre) VALUES ($1, $2) RETURNING id',
      [rifNorm, empresa]
    );
    const hash = await bcrypt.hash(password, 10);
    const { rows: [user] } = await client.query(
      `INSERT INTO usuarios (empresa_id, email, password_hash, nombre, rol)
       VALUES ($1, $2, $3, $4, 'rrhh') RETURNING id, empresa_id, rol, nombre, email`,
      [emp.id, email, hash, nombre]
    );
    await client.query('COMMIT');
    res.status(201).json({ token: sign(user, emp), user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }, empresa: { id: emp.id, rif: rifNorm, nombre: empresa } });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'RIF o email ya registrado' });
    throw err;
  } finally {
    client.release();
  }
});

// Registra un usuario dentro de una empresa existente (lo invita RRHH)
router.post('/register', async (req, res) => {
  const { rif, nombre, email, password, rol } = req.body ?? {};
  if (!rif || !RIF_RE.test(rif)) return res.status(400).json({ error: 'RIF inválido' });
  if (!['rrhh', 'experto', 'trabajador'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Faltan campos' });

  const rifNorm = rif.toUpperCase().replace('-', '');
  const { rows: [emp] } = await pool.query('SELECT id FROM empresas WHERE rif = $1', [rifNorm]);
  if (!emp) return res.status(404).json({ error: 'Empresa no encontrada' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows: [user] } = await pool.query(
      `INSERT INTO usuarios (empresa_id, email, password_hash, nombre, rol)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, empresa_id, rol, nombre, email`,
      [emp.id, email, hash, nombre, rol]
    );
    res.status(201).json({ token: sign(user), user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol } });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email ya registrado' });
    throw err;
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Faltan campos' });

  const { rows: [user] } = await pool.query(
    `SELECT u.id, u.empresa_id, u.rol, u.nombre, u.email, u.password_hash, u.debe_cambiar_password, e.nombre AS empresa, e.rif
     FROM usuarios u JOIN empresas e ON e.id = u.empresa_id WHERE u.email = $1`, [email]
  );
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  res.json({
    token: sign(user),
    user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, debe_cambiar_password: user.debe_cambiar_password },
    empresa: { rif: user.rif, nombre: user.empresa },
  });
});

router.post('/cambiar-password', requireAuth, async (req, res) => {
  const { password } = req.body ?? {};
  if (!password || password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  const hash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE usuarios SET password_hash = $1, debe_cambiar_password = false WHERE id = $2', [hash, req.user.sub]);
  res.json({ ok: true });
});

export function requireAuth(req, res, next) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

router.get('/me', requireAuth, async (req, res) => {
  const { rows: [user] } = await pool.query(
    `SELECT u.id, u.nombre, u.email, u.rol, e.rif, e.nombre AS empresa
     FROM usuarios u JOIN empresas e ON e.id = u.empresa_id WHERE u.id = $1`, [req.user.sub]
  );
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ user });
});

export default router;
