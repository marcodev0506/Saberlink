import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from './auth.js';

const router = Router();
router.use(requireAuth);

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * Job periódico (cada 1 minuto):
 * Revisa los usuarios activos con puesto/competencias/habilidades en la estructura
 * y genera notificaciones (sin duplicar) para los últimos 3 cursos relacionados
 * que aún no han acreditado.
 */
export async function sincronizarNotificaciones() {
  const [usuariosRes, unidadesRes, cursosRes, certsRes] = await Promise.all([
    pool.query(`SELECT id, empresa_id, nombre, email, ci FROM usuarios WHERE activo = true`),
    pool.query(
      `SELECT id, empresa_id, usuario_id, correo, ci, nombre_apellido, competencias, habilidades
       FROM unidades
       WHERE jsonb_array_length(competencias) > 0 OR jsonb_array_length(habilidades) > 0`
    ),
    pool.query(
      `SELECT id, empresa_id, titulo, competencias, habilidades, created_at
       FROM cursos
       ORDER BY created_at DESC`
    ),
    pool.query(`SELECT usuario_id, curso_id FROM certificados`),
  ]);

  const cursosPorEmpresa = new Map();
  for (const c of cursosRes.rows) {
    if (!cursosPorEmpresa.has(c.empresa_id)) cursosPorEmpresa.set(c.empresa_id, []);
    cursosPorEmpresa.get(c.empresa_id).push(c);
  }

  const unidadesPorEmpresa = new Map();
  for (const un of unidadesRes.rows) {
    if (!unidadesPorEmpresa.has(un.empresa_id)) unidadesPorEmpresa.set(un.empresa_id, []);
    unidadesPorEmpresa.get(un.empresa_id).push(un);
  }

  const acreditados = new Set(certsRes.rows.map((ce) => `${ce.usuario_id}:${ce.curso_id}`));
  let creadas = 0;

  for (const u of usuariosRes.rows) {
    const uns = unidadesPorEmpresa.get(u.empresa_id);
    if (!uns?.length) continue;

    const emailN = norm(u.email);
    const ciN = norm(u.ci);
    const nameN = norm(u.nombre);
    const unit = uns.find((x) => x.usuario_id === u.id)
      || uns.find((x) => norm(x.correo) === emailN)
      || (ciN ? uns.find((x) => norm(x.ci) === ciN) : null)
      || uns.find((x) => norm(x.nombre_apellido) === nameN);

    if (!unit) continue;

    const compSet = new Set((unit.competencias || []).map(norm));
    const habSet = new Set((unit.habilidades || []).map(norm));
    if (!compSet.size && !habSet.size) continue;

    const cursosEmp = cursosPorEmpresa.get(u.empresa_id) || [];
    const ultimos3 = [];

    for (const c of cursosEmp) {
      if (acreditados.has(`${u.id}:${c.id}`)) continue;
      const mc = (c.competencias || []).filter((x) => compSet.has(norm(x)));
      const mh = (c.habilidades || []).filter((x) => habSet.has(norm(x)));
      if (mc.length || mh.length) {
        ultimos3.push({ curso: c, tags: [...mc, ...mh] });
        if (ultimos3.length === 3) break;
      }
    }

    for (const { curso, tags } of ultimos3) {
      const mensaje = `Relacionado con: ${tags.slice(0, 2).join(', ')}`;
      const r = await pool.query(
        `INSERT INTO notificaciones (empresa_id, usuario_id, curso_id, titulo, mensaje)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (usuario_id, curso_id) DO NOTHING`,
        [u.empresa_id, u.id, curso.id, curso.titulo, mensaje]
      );
      if (r.rowCount) creadas++;
    }
  }

  if (creadas > 0) {
    console.log(`[cron-notificaciones] ${creadas} nuevas notificaciones generadas`);
  }
}

export function iniciarCronNotificaciones() {
  const correr = () => {
    sincronizarNotificaciones().catch((err) =>
      console.error('[cron-notificaciones] error:', err.message)
    );
  };
  correr();
  setInterval(correr, 60_000);
  console.log('[cron-notificaciones] activo (cada 1 minuto)');
}

// Lista las últimas 3 notificaciones del usuario autenticado + contador de no leídas
router.get('/', async (req, res) => {
  const [{ rows }, { rows: [cnt] }] = await Promise.all([
    pool.query(
      `SELECT id, curso_id, titulo, mensaje, leida, created_at
       FROM notificaciones
       WHERE usuario_id = $1 AND empresa_id = $2
       ORDER BY leida ASC, created_at DESC
       LIMIT 3`,
      [req.user.sub, req.user.empresa_id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM notificaciones
       WHERE usuario_id = $1 AND empresa_id = $2 AND leida = false`,
      [req.user.sub, req.user.empresa_id]
    ),
  ]);
  res.json({ notificaciones: rows, no_leidas: cnt?.total || 0 });
});

router.put('/:id/leer', async (req, res) => {
  await pool.query(
    `UPDATE notificaciones SET leida = true WHERE id = $1 AND usuario_id = $2`,
    [req.params.id, req.user.sub]
  );
  res.json({ ok: true });
});

router.post('/leer-todas', async (req, res) => {
  await pool.query(
    `UPDATE notificaciones SET leida = true WHERE usuario_id = $1 AND leida = false`,
    [req.user.sub]
  );
  res.json({ ok: true });
});

export default router;
