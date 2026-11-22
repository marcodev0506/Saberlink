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
    `SELECT id, parent_id, nombre, tipo, descripcion, competencias, habilidades,
            cargo, nombre_apellido, ci, correo, orden, metadata FROM unidades
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
  const { nombre, tipo, parent_id, descripcion, competencias, habilidades,
          cargo, nombre_apellido, ci, correo, orden, metadata } = req.body ?? {};
  if (!nombre?.trim()) return res.status(400).json({ error: 'Falta el nombre' });
  if (parent_id) {
    const { rows: [parent] } = await pool.query(
      'SELECT id FROM unidades WHERE id = $1 AND empresa_id = $2', [parent_id, req.user.empresa_id]
    );
    if (!parent) return res.status(404).json({ error: 'Unidad padre no encontrada' });
  }
  const { rows: [u] } = await pool.query(
    `INSERT INTO unidades (empresa_id, parent_id, nombre, tipo, descripcion, competencias, habilidades,
                           cargo, nombre_apellido, ci, correo, orden, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id, parent_id, nombre, tipo, descripcion, competencias, habilidades,
               cargo, nombre_apellido, ci, correo, orden, metadata`,
    [req.user.empresa_id, parent_id || null, nombre.trim(), tipo?.trim() || 'unidad',
     descripcion ?? '', JSON.stringify(competencias ?? []), JSON.stringify(habilidades ?? []),
     cargo ?? '', nombre_apellido ?? '', ci ?? '', correo ?? '', orden ?? 0, JSON.stringify(metadata ?? {})]
  );
  res.status(201).json({ unidad: u });
});

// Crea la estructura desde una descripción en lenguaje natural (Ollama)
router.post('/chat', requireRrhh, async (req, res) => {
  const { texto } = req.body ?? {};
  if (!texto?.trim()) return res.status(400).json({ error: 'Falta el texto' });
  const url = process.env.OLLAMA_URL || 'http://ollama:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.2:1b';
  const prompt = `Convierte esta descripción de estructura organizacional en JSON.
Descripción: "${texto}"
Devuelve SOLO un JSON válido con esta forma, sin texto extra ni markdown:
{"nombre":"Gerencia X","tipo":"gerencia","hijos":[{"nombre":"Líder","tipo":"unidad","hijos":[{"nombre":"Analista","tipo":"unidad","hijos":[]}]}]}
Si la descripción menciona cantidades (ej "3 analistas"), genera esa cantidad de hijos con nombres numerados (Analista 1, Analista 2…).`;
  const r = await fetch(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, format: 'json' }),
  });
  if (!r.ok) {
    const detalle = await r.text();
    return res.status(502).json({ error: `Ollama ${r.status}: ${detalle.slice(0, 200)} (url=${url}, model=${model})` });
  }
  const { response } = await r.json();
  let tree;
  try { tree = JSON.parse(response); } catch { return res.status(502).json({ error: 'La IA no devolvió JSON válido' }); }

  async function insertar(nodo, parentId) {
    const { rows: [u] } = await pool.query(
      `INSERT INTO unidades (empresa_id, parent_id, nombre, tipo) VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.user.empresa_id, parentId, String(nodo.nombre ?? 'Unidad').trim(), String(nodo.tipo ?? 'unidad').trim()]
    );
    for (const h of nodo.hijos ?? []) await insertar(h, u.id);
  }
  await insertar(tree, null);
  res.status(201).json({ ok: true });
});

router.put('/:id', requireRrhh, async (req, res) => {
  const { nombre, tipo, parent_id, descripcion, competencias, habilidades,
          cargo, nombre_apellido, ci, correo, orden, metadata } = req.body ?? {};
  const { rows: [u] } = await pool.query(
    `UPDATE unidades SET
       nombre      = COALESCE($3, nombre),
       tipo        = COALESCE($4, tipo),
       descripcion = COALESCE($5, descripcion),
       competencias= COALESCE($6, competencias),
       habilidades = COALESCE($7, habilidades),
       cargo       = COALESCE($8, cargo),
       nombre_apellido = COALESCE($9, nombre_apellido),
       ci          = COALESCE($10, ci),
       correo      = COALESCE($11, correo),
       orden       = COALESCE($12, orden),
       metadata    = COALESCE($13, metadata),
       parent_id   = COALESCE($14, parent_id)
     WHERE id = $1 AND empresa_id = $2
     RETURNING id, parent_id, nombre, tipo, descripcion, competencias, habilidades,
               cargo, nombre_apellido, ci, correo, orden, metadata`,
    [req.params.id, req.user.empresa_id, nombre?.trim() ?? null, tipo?.trim() ?? null,
     descripcion ?? null, competencias != null ? JSON.stringify(competencias) : null,
     habilidades != null ? JSON.stringify(habilidades) : null,
     cargo ?? null, nombre_apellido ?? null, ci ?? null, correo ?? null,
     orden ?? null, metadata != null ? JSON.stringify(metadata) : null, parent_id ?? null]
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
