import { Router } from 'express';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
import { pool } from '../db.js';
import { requireAuth } from './auth.js';

const DEFAULT_PASSWORD = 'Saberlink123';

const router = Router();
router.use(requireAuth);

function requireRrhh(req, res, next) {
  if (req.user.rol !== 'rrhh') return res.status(403).json({ error: 'Solo RRHH puede gestionar usuarios' });
  next();
}

router.get('/', requireRrhh, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nombre, email, rol, activo, created_at FROM usuarios
     WHERE empresa_id = $1 AND activo = true ORDER BY created_at`, [req.user.empresa_id]
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

// Importar usuarios desde la plantilla Excel (nombre, correo, rol)
router.post('/importar', requireRrhh, async (req, res) => {
  const { archivo_base64, archivo_nombre } = req.body ?? {};
  if (!archivo_base64) return res.status(400).json({ error: 'Falta el archivo' });
  if (archivo_nombre && !/\.(xlsx|xls|csv)$/i.test(archivo_nombre)) {
    return res.status(400).json({ error: 'Solo Excel (.xlsx/.xls) o CSV' });
  }
  let rows;
  try {
    const wb = XLSX.read(Buffer.from(archivo_base64, 'base64'));
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  } catch {
    return res.status(400).json({ error: 'No se pudo leer el Excel' });
  }
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  let creados = 0, omitidos = 0;
  const errores = [];
  for (const [i, r] of rows.entries()) {
    const nombre = String(r.nombre ?? r.Nombre ?? r.NOMBRE ?? '').trim();
    const email = String(r.correo ?? r.Correo ?? r.CORREO ?? r.email ?? r.Email ?? '').trim();
    const rol = String(r.rol ?? r.Rol ?? r.ROL ?? 'trabajador').trim().toLowerCase();
    if (!nombre || !email) { errores.push(`Fila ${i + 2}: falta nombre o correo`); continue; }
    if (!['rrhh', 'experto', 'trabajador'].includes(rol)) { errores.push(`Fila ${i + 2}: rol inválido "${rol}"`); continue; }
    try {
      await pool.query(
        `INSERT INTO usuarios (empresa_id, email, password_hash, nombre, rol, debe_cambiar_password)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [req.user.empresa_id, email, hash, nombre, rol]
      );
      creados++;
    } catch (err) {
      if (err.code === '23505') omitidos++;
      else errores.push(`Fila ${i + 2}: ${err.message}`);
    }
  }
  res.json({ creados, omitidos, errores, password_default: DEFAULT_PASSWORD });
});

// Inhabilitar / habilitar usuarios por bloques (sin borrar de la BD)
router.post('/estado', requireRrhh, async (req, res) => {
  const { ids, activo } = req.body ?? {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Faltan ids' });
  const r = await pool.query(
    'UPDATE usuarios SET activo = $2 WHERE id = ANY($1::uuid[]) AND empresa_id = $3 AND id <> $4',
    [ids, !!activo, req.user.empresa_id, req.user.sub]
  );
  res.json({ actualizados: r.rowCount });
});

export default router;
