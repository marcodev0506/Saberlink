// Simula evaluaciones diagnósticas, finales y certificados para un usuario
// sobre los cursos relacionados con las competencias y habilidades de su puesto.
// Uso: docker compose exec api node src/scripts/simular-usuario.js
// Opcional: EMAIL=otro@empresa.com docker compose exec -e EMAIL=otro@empresa.com api node src/scripts/simular-usuario.js
import { pool } from '../db.js';

const EMAIL = (process.env.EMAIL || 'gustavo.fernandez@acme.com').trim().toLowerCase();
const norm = (s) => String(s || '').trim().toLowerCase();

async function main() {
  const { rows: [user] } = await pool.query(
    `SELECT u.id, u.empresa_id, u.nombre, u.email, u.ci, u.rol, e.nombre AS empresa
     FROM usuarios u JOIN empresas e ON e.id = u.empresa_id
     WHERE LOWER(TRIM(u.email)) = $1`,
    [EMAIL]
  );
  if (!user) {
    console.error(`Usuario no encontrado: ${EMAIL}`);
    process.exit(1);
  }

  // Buscar su puesto en la estructura organizacional
  const { rows: unidades } = await pool.query(
    `SELECT id, nombre, cargo, nombre_apellido, ci, correo, usuario_id, competencias, habilidades
     FROM unidades WHERE empresa_id = $1`,
    [user.empresa_id]
  );
  const unit = unidades.find((u) => u.usuario_id === user.id)
    || unidades.find((u) => norm(u.correo) === EMAIL)
    || unidades.find((u) => norm(u.nombre_apellido) === norm(user.nombre));

  if (!unit) {
    console.error(`El usuario ${user.nombre} no está asignado a ningún puesto en la tabla unidades.`);
    process.exit(1);
  }

  // Asegurar FK usuario_id y sincronizar CI
  await pool.query('UPDATE unidades SET usuario_id = $1 WHERE id = $2', [user.id, unit.id]);
  if (!user.ci && unit.ci) {
    await pool.query('UPDATE usuarios SET ci = $1 WHERE id = $2', [unit.ci, user.id]);
  }

  const compSet = new Set((unit.competencias || []).map(norm));
  const habSet = new Set((unit.habilidades || []).map(norm));

  const { rows: allCursos } = await pool.query(
    `SELECT id, titulo, competencias, habilidades FROM cursos WHERE empresa_id = $1 ORDER BY created_at DESC`,
    [user.empresa_id]
  );

  const relacionados = allCursos.filter((c) => {
    const mc = (c.competencias || []).some((x) => compSet.has(norm(x)));
    const mh = (c.habilidades || []).some((x) => habSet.has(norm(x)));
    return mc || mh;
  });

  console.log(`\nUsuario: ${user.nombre} (${user.email}) | Empresa: ${user.empresa}`);
  console.log(`Puesto: ${unit.cargo || unit.nombre} | CI: ${unit.ci || user.ci || '—'}`);
  console.log(`Competencias del puesto: ${JSON.stringify(unit.competencias || [])}`);
  console.log(`Habilidades del puesto:  ${JSON.stringify(unit.habilidades || [])}`);
  console.log(`Cursos en la empresa: ${allCursos.length} | Relacionados al puesto: ${relacionados.length}\n`);

  if (!relacionados.length) {
    console.error('No hay cursos que compartan competencias o habilidades con el puesto del usuario.');
    process.exit(1);
  }

  // Limpiar intentos, audios y certificados previos del usuario para una simulación limpia
  await pool.query('DELETE FROM intentos WHERE usuario_id = $1', [user.id]);
  await pool.query('DELETE FROM progreso_audio WHERE usuario_id = $1', [user.id]);
  await pool.query('DELETE FROM certificados WHERE usuario_id = $1', [user.id]);

  // Escenarios realistas: aprobados (100%), reprobados con final (100%), audio reproducido (60%), y solo diagnóstica (30%)
  const escenarios = [
    { diag: [2, 5], audio: true,  final: [5, 5], aprobado: true,  diasAtras: 20, label: 'Aprobado (+60%) — 100%' },
    { diag: [3, 5], audio: true,  final: [5, 5], aprobado: true,  diasAtras: 14, label: 'Aprobado (+40%) — 100%' },
    { diag: [4, 5], audio: true,  final: [5, 5], aprobado: true,  diasAtras: 7,  label: 'Aprobado (+20%) — 100%' },
    { diag: [1, 5], audio: true,  final: [3, 5], aprobado: false, diasAtras: 5,  label: 'Reprobado (+40%) — 100%' },
    { diag: [3, 5], audio: true,  final: [2, 5], aprobado: false, diasAtras: 3,  label: 'Reprobado (-20%) — 100%' },
    { diag: [2, 5], audio: true,  final: null,   aprobado: false, diasAtras: 2,  label: 'En progreso (diagnóstica + audio) — 60%' },
    { diag: [3, 5], audio: false, final: null,   aprobado: false, diasAtras: 1,  label: 'En progreso (solo diagnóstica) — 30%' },
  ];

  const elegidos = relacionados.slice(0, escenarios.length);

  for (let i = 0; i < elegidos.length; i++) {
    const c = elegidos[i];
    const esc = escenarios[i];
    const fDiag = new Date(Date.now() - (esc.diasAtras + 2) * 86400000);
    const fAudio = new Date(Date.now() - (esc.diasAtras + 1) * 86400000);
    const fFinal = new Date(Date.now() - esc.diasAtras * 86400000);

    // 1) Evaluación diagnóstica inicial (30%)
    await pool.query(
      `INSERT INTO intentos (curso_id, usuario_id, respuestas, puntaje, total, aprobado, tipo, created_at)
       VALUES ($1, $2, '{}'::jsonb, $3, $4, false, 'diagnostico', $5)`,
      [c.id, user.id, esc.diag[0], esc.diag[1], fDiag]
    );

    // 2) Reproducción de audio (60%)
    if (esc.audio) {
      await pool.query(
        `INSERT INTO progreso_audio (curso_id, leccion_id, usuario_id, created_at)
         VALUES ($1, NULL, $2, $3) ON CONFLICT DO NOTHING`,
        [c.id, user.id, fAudio]
      );
    }

    // 3) Evaluación final (100%)
    if (esc.final) {
      await pool.query(
        `INSERT INTO intentos (curso_id, usuario_id, respuestas, puntaje, total, aprobado, tipo, created_at)
         VALUES ($1, $2, '{}'::jsonb, $3, $4, $5, 'teorica', $6)`,
        [c.id, user.id, esc.final[0], esc.final[1], esc.aprobado, fFinal]
      );

      // 3) Certificado si aprobó
      if (esc.aprobado) {
        await pool.query(
          `INSERT INTO certificados (empresa_id, curso_id, usuario_id, puntaje, total, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (curso_id, usuario_id) DO UPDATE SET puntaje = $4, total = $5, created_at = $6`,
          [user.empresa_id, c.id, user.id, esc.final[0], esc.final[1], fFinal]
        );
      }
    }

    console.log(`  ✓ ${c.titulo.slice(0, 55).padEnd(55)} → ${esc.label}`);
  }

  console.log('\nSimulación completada con éxito.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
