import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from './auth.js';
import { publish } from '../queue.js';
import { mkdir, writeFile } from 'fs/promises';

const router = Router();
router.use(requireAuth);

const puedeEditar = (rol) => rol === 'rrhh' || rol === 'gestor_curso';
const normTag = (s) => String(s || '').trim().toLowerCase();

async function getPerfilPuesto(empresaId, userId) {
  const [{ rows: [user] }, { rows: unidades }] = await Promise.all([
    pool.query(
      `SELECT u.id, u.nombre, u.email, u.ci, u.rol, e.nombre AS empresa, e.rif
       FROM usuarios u JOIN empresas e ON e.id = u.empresa_id
       WHERE u.id = $1 AND u.empresa_id = $2`,
      [userId, empresaId]
    ),
    pool.query(
      `SELECT id, parent_id, usuario_id, nombre, tipo, cargo, nombre_apellido, ci, correo, competencias, habilidades
       FROM unidades WHERE empresa_id = $1`,
      [empresaId]
    ),
  ]);
  if (!user) return null;
  const byId = new Map(unidades.map((u) => [u.id, u]));
  const emailN = normTag(user.email);
  const ciN = normTag(user.ci);
  const nameN = normTag(user.nombre);
  const unit = unidades.find((u) => u.usuario_id === user.id)
    || unidades.find((u) => normTag(u.correo) === emailN)
    || (ciN ? unidades.find((u) => normTag(u.ci) === ciN) : null)
    || unidades.find((u) => normTag(u.nombre_apellido) === nameN)
    || null;
  const parent = unit?.parent_id ? byId.get(unit.parent_id) : null;
  return {
    ...user,
    ci: user.ci || unit?.ci || '',
    cargo: unit ? (unit.cargo || unit.nombre) : '',
    unidad: parent ? (parent.cargo || parent.nombre) : (unit?.tipo || ''),
    competencias_puesto: Array.isArray(unit?.competencias) ? unit.competencias : [],
    habilidades_puesto: Array.isArray(unit?.habilidades) ? unit.habilidades : [],
    tiene_puesto: Boolean(unit),
  };
}

function matchRelacion(curso, compSet, habSet) {
  const cComp = Array.isArray(curso.competencias) ? curso.competencias : [];
  const cHab = Array.isArray(curso.habilidades) ? curso.habilidades : [];
  const matchComp = cComp.filter((x) => compSet.has(normTag(x)));
  const matchHab = cHab.filter((x) => habSet.has(normTag(x)));
  return { matchComp, matchHab, relacionado: matchComp.length > 0 || matchHab.length > 0 };
}

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.titulo, c.objetivo, c.estado, c.competencias, c.habilidades, c.audio_path,
            c.imagen_path, c.duracion
     FROM cursos c
     WHERE c.empresa_id = $1 ORDER BY c.created_at DESC`, [req.user.empresa_id]
  );
  if (req.user.rol === 'trabajador') {
    const perfil = await getPerfilPuesto(req.user.empresa_id, req.user.sub);
    const compSet = new Set((perfil?.competencias_puesto || []).map(normTag));
    const habSet = new Set((perfil?.habilidades_puesto || []).map(normTag));
    const filtrados = rows.filter((c) => matchRelacion(c, compSet, habSet).relacionado);
    return res.json({ cursos: filtrados });
  }
  res.json({ cursos: rows });
});

// Portal de Cursos y Acreditación del Trabajador
router.get('/mi-portal', async (req, res) => {
  const empresaId = req.user.empresa_id;
  const userId = req.user.sub;

  const perfil = await getPerfilPuesto(empresaId, userId);
  if (!perfil) return res.status(404).json({ error: 'Usuario no encontrado' });

  const [cursosRes, leccionesRes, intentosRes, certsRes, audioRes] = await Promise.all([
    pool.query(
      `SELECT c.id, c.titulo, c.objetivo, c.estado, c.competencias, c.habilidades,
              c.imagen_path, c.duracion
       FROM cursos c
       WHERE c.empresa_id = $1 ORDER BY c.created_at DESC`,
      [empresaId]
    ),
    pool.query(
      `SELECT l.curso_id, COUNT(*)::int AS total
       FROM lecciones l JOIN cursos c ON c.id = l.curso_id
       WHERE c.empresa_id = $1 GROUP BY l.curso_id`,
      [empresaId]
    ),
    pool.query(
      `SELECT i.id, i.curso_id, i.puntaje, i.total, i.aprobado, i.tipo, i.created_at
       FROM intentos i JOIN cursos c ON c.id = i.curso_id
       WHERE i.usuario_id = $1 AND c.empresa_id = $2
       ORDER BY i.created_at ASC`,
      [userId, empresaId]
    ),
    pool.query(
      `SELECT ce.codigo, ce.curso_id, ce.puntaje, ce.total, ce.created_at,
              c.titulo AS curso, c.duracion, c.competencias, c.habilidades
       FROM certificados ce JOIN cursos c ON c.id = ce.curso_id
       WHERE ce.usuario_id = $1 AND ce.empresa_id = $2
       ORDER BY ce.created_at DESC`,
      [userId, empresaId]
    ),
    pool.query(
      `SELECT curso_id, COUNT(*)::int AS reproducidos, MAX(created_at) AS ultimo_audio
       FROM progreso_audio
       WHERE usuario_id = $1
       GROUP BY curso_id`,
      [userId]
    ),
  ]);

  const leccCount = new Map(leccionesRes.rows.map((r) => [r.curso_id, r.total]));
  const certByCurso = new Map(certsRes.rows.map((ce) => [ce.curso_id, ce]));
  const audioByCurso = new Map(audioRes.rows.map((a) => [a.curso_id, a]));

  // Agrupar intentos del trabajador por curso
  const intentosByCurso = new Map();
  for (const it of intentosRes.rows) {
    if (!intentosByCurso.has(it.curso_id)) {
      intentosByCurso.set(it.curso_id, { diag: null, final: null, count: 0, ultima_fecha: null });
    }
    const g = intentosByCurso.get(it.curso_id);
    g.count++;
    g.ultima_fecha = it.created_at;
    if (it.tipo === 'diagnostico') {
      if (!g.diag) g.diag = it;
    } else if (it.tipo === 'teorica' || it.tipo === 'final') {
      if (!g.final || it.aprobado || !g.final.aprobado) g.final = it;
    }
  }

  const pct = (p, t) => (t > 0 ? Math.round((p / t) * 1000) / 10 : null);
  const compSet = new Set(perfil.competencias_puesto.map(normTag));
  const habSet = new Set(perfil.habilidades_puesto.map(normTag));

  // Solo cursos que comparten al menos una competencia o habilidad con el puesto del trabajador
  const cursosRelacionados = [];
  for (const c of cursosRes.rows) {
    const { matchComp, matchHab, relacionado } = matchRelacion(c, compSet, habSet);
    if (!relacionado) continue;

    const info = intentosByCurso.get(c.id) || null;
    const ce = certByCurso.get(c.id) || null;
    const audioInfo = audioByCurso.get(c.id) || null;
    const reprodujoAudio = Boolean(audioInfo && audioInfo.reproducidos > 0);
    const modulosTotal = leccCount.get(c.id) || 0;
    const acreditado = Boolean(ce || info?.final?.aprobado);
    const enProgreso = !acreditado && Boolean(info || reprodujoAudio);

    const diagPct = info?.diag ? pct(info.diag.puntaje, info.diag.total) : null;
    const finalPct = info?.final ? pct(info.final.puntaje, info.final.total) : (ce ? pct(ce.puntaje, ce.total) : null);

    // Progreso porcentual real por hitos:
    // Diagnóstica = 30% | Reprodujo audio del curso = 60% | Evaluación final = 100%
    let progresoPct = 0;
    if (acreditado || info?.final) progresoPct = 100;
    else if (reprodujoAudio) progresoPct = 60;
    else if (info?.diag) progresoPct = 30;

    const modulosCompletados = (acreditado || info?.final)
      ? modulosTotal
      : Math.min(modulosTotal, audioInfo?.reproducidos || 0);
    const nivel = (matchComp.length + matchHab.length) >= 2 ? 'Prioritario' : 'Recomendado';

    cursosRelacionados.push({
      id: c.id,
      titulo: c.titulo,
      objetivo: c.objetivo,
      duracion: c.duracion || '',
      estado: c.estado,
      imagen_path: c.imagen_path || '',
      competencias: Array.isArray(c.competencias) ? c.competencias : [],
      habilidades: Array.isArray(c.habilidades) ? c.habilidades : [],
      match_competencias: matchComp,
      match_habilidades: matchHab,
      nivel,
      modulos_total: modulosTotal,
      modulos_completados: modulosCompletados,
      progreso_pct: progresoPct,
      diag_puntaje: info?.diag?.puntaje ?? null,
      diag_total: info?.diag?.total ?? null,
      diag_pct: diagPct,
      final_puntaje: info?.final?.puntaje ?? ce?.puntaje ?? null,
      final_total: info?.final?.total ?? ce?.total ?? null,
      final_pct: finalPct,
      acreditado,
      en_progreso: enProgreso,
      certificado: ce?.codigo ?? null,
      ultima_fecha: info?.ultima_fecha ?? ce?.created_at ?? null,
    });
  }

  const cursosEnCurso = cursosRelacionados.filter((c) => c.en_progreso);
  const cursosCompletados = cursosRelacionados.filter((c) => c.acreditado);
  const cursosDisponibles = cursosRelacionados.filter((c) => !c.en_progreso && !c.acreditado);

  const avanceGeneralPct = cursosRelacionados.length
    ? Math.round(cursosRelacionados.reduce((s, c) => s + c.progreso_pct, 0) / cursosRelacionados.length)
    : 0;

  let insignia = 'Inicial';
  if (avanceGeneralPct >= 80 && cursosCompletados.length > 0) insignia = 'Experto Acreditado';
  else if (avanceGeneralPct >= 50) insignia = 'Avanzado';
  else if (avanceGeneralPct >= 20 || cursosEnCurso.length > 0) insignia = 'En Desarrollo';

  // Resumen de dominio por cada competencia y habilidad del puesto
  const competenciasResumen = [];
  for (const nombre of perfil.competencias_puesto) {
    const n = normTag(nombre);
    const rel = cursosRelacionados.filter((c) => c.competencias.some((x) => normTag(x) === n));
    const acr = rel.filter((c) => c.acreditado).length;
    const dom = rel.length ? Math.round(rel.reduce((s, c) => s + c.progreso_pct, 0) / rel.length) : 0;
    competenciasResumen.push({ nombre, tipo: 'competencia', cursos_relacionados: rel.length, cursos_acreditados: acr, dominio_pct: dom });
  }
  for (const nombre of perfil.habilidades_puesto) {
    const n = normTag(nombre);
    const rel = cursosRelacionados.filter((c) => c.habilidades.some((x) => normTag(x) === n));
    const acr = rel.filter((c) => c.acreditado).length;
    const dom = rel.length ? Math.round(rel.reduce((s, c) => s + c.progreso_pct, 0) / rel.length) : 0;
    competenciasResumen.push({ nombre, tipo: 'habilidad', cursos_relacionados: rel.length, cursos_acreditados: acr, dominio_pct: dom });
  }

  // Histórico de certificados con diagnóstica vs final y vigencia (1 año)
  const ahora = Date.now();
  const certificados = certsRes.rows.map((ce) => {
    const info = intentosByCurso.get(ce.curso_id);
    const diagPct = info?.diag ? pct(info.diag.puntaje, info.diag.total) : null;
    const finalPct = pct(ce.puntaje, ce.total);
    const gananciaPct = (diagPct !== null && finalPct !== null) ? Math.round((finalPct - diagPct) * 10) / 10 : null;
    const emitida = new Date(ce.created_at);
    const vence = new Date(emitida);
    vence.setFullYear(vence.getFullYear() + 1);
    const diasRestantes = Math.ceil((vence.getTime() - ahora) / 86400000);
    const vigencia_estado = diasRestantes <= 0 ? 'vencido' : (diasRestantes <= 60 ? 'proximo_vencer' : 'vigente');
    return {
      codigo: ce.codigo,
      curso_id: ce.curso_id,
      curso: ce.curso,
      duracion: ce.duracion || '',
      competencias: Array.isArray(ce.competencias) ? ce.competencias : [],
      habilidades: Array.isArray(ce.habilidades) ? ce.habilidades : [],
      diag_puntaje: info?.diag?.puntaje ?? null,
      diag_total: info?.diag?.total ?? null,
      diag_pct: diagPct,
      final_puntaje: ce.puntaje,
      final_total: ce.total,
      final_pct: finalPct,
      ganancia_pct: gananciaPct,
      created_at: ce.created_at,
      vence_at: vence.toISOString(),
      vigencia_estado,
    };
  });

  res.json({
    perfil: { ...perfil, insignia },
    resumen: {
      avance_general_pct: avanceGeneralPct,
      en_progreso: cursosEnCurso.length,
      disponibles: cursosDisponibles.length,
      completados: cursosCompletados.length,
      total_relacionados: cursosRelacionados.length,
    },
    competencias_resumen: competenciasResumen,
    cursos_en_curso: cursosEnCurso,
    cursos_relacionados: cursosRelacionados,
    certificados,
  });
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

// Reportes avanzados de desempeño, avance diagnóstico vs final y acreditación de competencias
router.get('/reportes', async (req, res) => {
  if (!puedeEditar(req.user.rol)) return res.status(403).json({ error: 'Solo RRHH o Gestor de curso' });
  const empresaId = req.user.empresa_id;

  const [usuariosRes, unidadesRes, cursosRes, intentosRes, certsRes] = await Promise.all([
    pool.query(
      `SELECT id, nombre, email, rol, activo FROM usuarios
       WHERE empresa_id = $1 AND activo = true ORDER BY nombre`,
      [empresaId]
    ),
    pool.query(
      `SELECT id, parent_id, nombre, tipo, cargo, nombre_apellido, ci, correo, competencias, habilidades
       FROM unidades WHERE empresa_id = $1`,
      [empresaId]
    ),
    pool.query(
      `SELECT id, titulo, duracion, estado, competencias, habilidades
       FROM cursos WHERE empresa_id = $1 ORDER BY titulo`,
      [empresaId]
    ),
    pool.query(
      `SELECT i.id, i.curso_id, i.usuario_id, i.puntaje, i.total, i.aprobado, i.tipo, i.created_at
       FROM intentos i
       JOIN cursos c ON c.id = i.curso_id
       WHERE c.empresa_id = $1
       ORDER BY i.created_at ASC`,
      [empresaId]
    ),
    pool.query(
      `SELECT codigo, curso_id, usuario_id, puntaje, total, created_at
       FROM certificados WHERE empresa_id = $1`,
      [empresaId]
    ),
  ]);

  const norm = (s) => String(s || '').trim().toLowerCase();
  const unitById = new Map(unidadesRes.rows.map((u) => [u.id, u]));
  const unitByEmail = new Map();
  const unitByName = new Map();
  for (const u of unidadesRes.rows) {
    if (norm(u.correo)) unitByEmail.set(norm(u.correo), u);
    if (norm(u.nombre_apellido)) unitByName.set(norm(u.nombre_apellido), u);
  }

  const trabajadores = usuariosRes.rows.map((u) => {
    const unit = unitByEmail.get(norm(u.email)) || unitByName.get(norm(u.nombre)) || null;
    const parent = unit?.parent_id ? unitById.get(unit.parent_id) : null;
    return {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      puesto: unit ? (unit.cargo || unit.nombre) : '',
      area: parent ? (parent.cargo || parent.nombre) : (unit?.tipo || ''),
      competencias_puesto: Array.isArray(unit?.competencias) ? unit.competencias : [],
      habilidades_puesto: Array.isArray(unit?.habilidades) ? unit.habilidades : [],
    };
  });
  const trabById = new Map(trabajadores.map((t) => [t.id, t]));
  const cursoById = new Map(cursosRes.rows.map((c) => [c.id, c]));

  const certMap = new Map();
  for (const ce of certsRes.rows) {
    certMap.set(`${ce.usuario_id}:${ce.curso_id}`, ce);
  }

  // Agrupar intentos por (usuario_id, curso_id)
  const pares = new Map();
  const ensurePar = (uid, cid) => {
    const key = `${uid}:${cid}`;
    if (!pares.has(key)) {
      pares.set(key, { usuario_id: uid, curso_id: cid, diag: null, final: null, practica: null, intentos: 0, ultima_fecha: null });
    }
    return pares.get(key);
  };

  for (const it of intentosRes.rows) {
    if (!trabById.has(it.usuario_id) || !cursoById.has(it.curso_id)) continue;
    const p = ensurePar(it.usuario_id, it.curso_id);
    p.intentos++;
    p.ultima_fecha = it.created_at;
    if (it.tipo === 'diagnostico') {
      // Diagnóstica inicial = primer intento diagnóstico registrado
      if (!p.diag) p.diag = it;
    } else if (it.tipo === 'practica') {
      p.practica = it;
    } else {
      // Evaluación final (teórica / final) = último intento (o el más reciente aprobado)
      if (!p.final || it.aprobado || !p.final.aprobado) {
        p.final = it;
      }
    }
  }

  for (const ce of certsRes.rows) {
    if (!trabById.has(ce.usuario_id) || !cursoById.has(ce.curso_id)) continue;
    const p = ensurePar(ce.usuario_id, ce.curso_id);
    if (!p.ultima_fecha || new Date(ce.created_at) > new Date(p.ultima_fecha)) {
      p.ultima_fecha = ce.created_at;
    }
  }

  const pct = (puntaje, total) => (total > 0 ? Math.round((puntaje / total) * 1000) / 10 : null);
  const intersect = (a = [], b = []) => {
    const setB = new Set(b.map(norm));
    return a.filter((x) => setB.has(norm(x)));
  };

  const registros = [];
  for (const [key, p] of pares.entries()) {
    const t = trabById.get(p.usuario_id);
    const c = cursoById.get(p.curso_id);
    const ce = certMap.get(key) || null;

    const diagPct = p.diag ? pct(p.diag.puntaje, p.diag.total) : null;
    const finalPuntaje = p.final ? p.final.puntaje : (ce ? ce.puntaje : null);
    const finalTotal = p.final ? p.final.total : (ce ? ce.total : null);
    const finalPct = finalTotal != null ? pct(finalPuntaje, finalTotal) : null;
    const finalAprobado = Boolean(p.final?.aprobado || ce);

    const gananciaPct = (diagPct !== null && finalPct !== null)
      ? Math.round((finalPct - diagPct) * 10) / 10
      : null;
    const gananciaPts = (p.diag && finalPuntaje !== null && p.diag.total === finalTotal)
      ? (finalPuntaje - p.diag.puntaje)
      : null;

    const cursoComp = Array.isArray(c.competencias) ? c.competencias : [];
    const cursoHab = Array.isArray(c.habilidades) ? c.habilidades : [];
    const compVinculadas = intersect(cursoComp, t.competencias_puesto);
    const habVinculadas = intersect(cursoHab, t.habilidades_puesto);

    const acreditado = Boolean(ce || finalAprobado);
    let estado = 'pendiente';
    if (acreditado) estado = 'acreditado';
    else if (finalPct !== null) estado = 'reprobado';
    else if (diagPct !== null) estado = 'en_curso';

    registros.push({
      id: key,
      usuario_id: t.id,
      trabajador: t.nombre,
      email: t.email,
      puesto: t.puesto,
      area: t.area,
      curso_id: c.id,
      curso: c.titulo,
      duracion: c.duracion || '',
      diag_puntaje: p.diag?.puntaje ?? null,
      diag_total: p.diag?.total ?? null,
      diag_pct: diagPct,
      diag_fecha: p.diag?.created_at ?? null,
      final_puntaje: finalPuntaje,
      final_total: finalTotal,
      final_pct: finalPct,
      final_aprobado: finalAprobado,
      final_fecha: p.final?.created_at ?? ce?.created_at ?? null,
      ganancia_pct: gananciaPct,
      ganancia_pts: gananciaPts,
      intentos: p.intentos,
      acreditado,
      estado,
      certificado: ce?.codigo ?? null,
      curso_competencias: cursoComp,
      curso_habilidades: cursoHab,
      competencias_puesto: t.competencias_puesto,
      habilidades_puesto: t.habilidades_puesto,
      competencias_vinculadas: compVinculadas,
      habilidades_vinculadas: habVinculadas,
      alineado_puesto: compVinculadas.length > 0 || habVinculadas.length > 0,
      competencias_acreditadas: acreditado ? cursoComp : [],
      habilidades_acreditadas: acreditado ? cursoHab : [],
      ultima_fecha: p.ultima_fecha,
    });
  }

  registros.sort((a, b) => new Date(b.ultima_fecha || 0) - new Date(a.ultima_fecha || 0));

  // Resumen por curso
  const cursos = cursosRes.rows.map((c) => {
    const regs = registros.filter((r) => r.curso_id === c.id);
    const diags = regs.filter((r) => r.diag_pct !== null);
    const finals = regs.filter((r) => r.final_pct !== null);
    const gains = regs.filter((r) => r.ganancia_pct !== null);
    const avg = (arr, fn) => arr.length ? Math.round((arr.reduce((s, x) => s + fn(x), 0) / arr.length) * 10) / 10 : null;
    return {
      id: c.id,
      titulo: c.titulo,
      duracion: c.duracion || '',
      estado: c.estado,
      competencias: Array.isArray(c.competencias) ? c.competencias : [],
      habilidades: Array.isArray(c.habilidades) ? c.habilidades : [],
      participantes: regs.length,
      acreditados: regs.filter((r) => r.acreditado).length,
      promedio_diag: avg(diags, (r) => r.diag_pct),
      promedio_final: avg(finals, (r) => r.final_pct),
      ganancia_promedio: avg(gains, (r) => r.ganancia_pct),
    };
  }).sort((a, b) => b.participantes - a.participantes || a.titulo.localeCompare(b.titulo));

  res.json({ registros, cursos, trabajadores });
});

router.get('/:id', async (req, res) => {
  const { rows: [c] } = await pool.query(
    `SELECT c.id, c.titulo, c.objetivo, c.estado, c.evaluaciones, c.guion, c.imagen_path
     FROM cursos c
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

// Audio de una lección (registra reproducción real del usuario para el 60% de avance)
router.get('/:id/audio/:leccionId', async (req, res) => {
  const { rows: [l] } = await pool.query(
    `SELECT l.audio_path FROM lecciones l JOIN cursos c ON c.id = l.curso_id
     WHERE l.id = $1 AND c.id = $2 AND c.empresa_id = $3`,
    [req.params.leccionId, req.params.id, req.user.empresa_id]
  );
  if (!l?.audio_path) return res.status(404).json({ error: 'Sin audio' });
  await pool.query(
    `INSERT INTO progreso_audio (curso_id, leccion_id, usuario_id)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [req.params.id, req.params.leccionId, req.user.sub]
  ).catch(() => {});
  res.sendFile(l.audio_path);
});

router.post('/', async (req, res) => {
  if (!puedeEditar(req.user.rol)) return res.status(403).json({ error: 'Solo RRHH o Gestor de curso' });
  const { titulo, objetivo, duracion, competencias, habilidades, archivo_base64, archivo_nombre, imagen_base64, imagen_nombre } = req.body ?? {};
  if (!titulo?.trim()) return res.status(400).json({ error: 'Falta el título' });

  const { rows: [c] } = await pool.query(
    `INSERT INTO cursos (empresa_id, titulo, objetivo, competencias, habilidades, duracion)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
     RETURNING id, titulo, objetivo, estado`,
    [req.user.empresa_id, titulo.trim(), objetivo ?? '',
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
  const { titulo, objetivo, duracion, competencias, habilidades, estado, imagen_base64, imagen_nombre, archivo_base64, archivo_nombre } = req.body ?? {};
  const { rows: [c] } = await pool.query(
    `UPDATE cursos SET
       titulo = COALESCE($3, titulo),
       objetivo = COALESCE($4, objetivo),
       competencias = COALESCE($5, competencias),
       habilidades = COALESCE($7, habilidades),
       estado = COALESCE($6, estado),
       duracion = COALESCE($8, duracion)
     WHERE id = $1 AND empresa_id = $2 RETURNING id, titulo, objetivo, estado`,
    [req.params.id, req.user.empresa_id, titulo ?? null, objetivo ?? null,
     competencias != null ? JSON.stringify(competencias) : null, estado ?? null,
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
