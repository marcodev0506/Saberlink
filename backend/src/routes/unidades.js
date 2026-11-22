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

// Crea la estructura desde una descripción en lenguaje natural.
// Ollama interpreta el texto libre; si falla, un parser determinístico
// cubre los patrones habituales ("con N hijos", "y cada", "dentro de X").
router.post('/chat', requireRrhh, async (req, res) => {
  const { texto } = req.body ?? {};
  if (!texto?.trim()) return res.status(400).json({ error: 'Falta el texto' });

  let tree = null;
  const cap = (s) => s.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  const sing = (s) => s.trim().replace(/^(?:un|una)\s+/i, '').replace(/(ces|es|e|s)$/i, '');
  const NUM = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
  const tipoDe = (s) => (/gerencia|presidencia|direcci/i.test(s) ? 'gerencia' : 'unidad');
  const mk = (nombre, cantidad, hijos = []) => {
    const base = cap(sing(nombre));
    return Array.from({ length: cantidad }, (_, i) => ({
      nombre: cantidad > 1 ? `${base} ${i + 1}` : base, tipo: tipoDe(base), hijos,
    }));
  };

  // Un ítem: [N | un | una] nombre   -> nodo(s)
  function parseItem(t) {
    const m = t.trim().match(/^(?:(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+)?(.+)$/i);
    if (!m) return null;
    return { nombre: m[2], cantidad: m[1] ? (NUM[m[1].toLowerCase()] ?? Number(m[1])) : 1 };
  }

  // Lista de ítems separados por "," o " y " (pero no "cada" ni "dentro")
  function parseLista(t) {
    return t.split(/\s*,\s*|\s+y\s+/i).map(parseItem).filter(Boolean);
  }

  // Determinístico: "<raíz> con <lista> [y cada X N hijos] [, y dentro de X <lista>]…"
  const txt = texto.trim().replace(/^(?:quiero\s+crear\s+|crea(?:r)?\s+)/i, '');
  const partes = txt.split(/\s*(?:,|\.)?\s*y?\s*dentro\s+de\s+/i);
  const mMain = partes[0].match(/^(.+?)\s+con\s+(.+)$/i);

  if (mMain) {
    const raizNombre = mMain[1];
    let hijosTxt = mMain[2];
    // "y cada X N hijos" se aplica a todos los hijos de la lista
    const cada = hijosTxt.match(/^(.*?)\s+y\s+cada\s+[\wáéíóúñ ]+?\s+(?:con\s+)?(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(.+)$/i);
    let porHijo = null;
    if (cada) { hijosTxt = cada[1]; porHijo = { cant: NUM[cada[2].toLowerCase()] ?? Number(cada[2]), nombre: cada[3] }; }
    tree = {
      nombre: cap(sing(raizNombre)), tipo: tipoDe(raizNombre),
      hijos: parseLista(hijosTxt).flatMap((it) =>
        mk(it.nombre, it.cantidad, porHijo ? mk(porHijo.nombre, porHijo.cant) : [])),
    };
    // cláusulas "dentro de X": agregan hijos a los nodos cuyo nombre contiene X
    const idx = {};
    (function index(n) { idx[n.nombre.toLowerCase()] = idx[n.nombre.toLowerCase()] ?? n; n.hijos.forEach(index); })(tree);
    for (const clausula of partes.slice(1)) {
      const mm = clausula.match(/^(.+?)\s+(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(.+?)[.\s]*$/i)
              ?? clausula.match(/^(.+?)\s+(.+?)[.\s]*$/);
      if (!mm) continue;
      const destino = mm[1].trim().toLowerCase();
      const hijosCl = parseLista(mm.length === 4 ? `${mm[2]} ${mm[3]}` : mm[2]);
      const norm = (s) => s.split(/\s+/).map((w) => sing(w)).join(' ');
      const dNorm = norm(destino);
      const target = Object.keys(idx).find((k) => {
        const kNorm = norm(k);
        return kNorm.includes(dNorm) || dNorm.includes(kNorm) ||
               dNorm.split(' ').every((w) => w.length > 2 && kNorm.includes(w));
      });
      if (target) idx[target].hijos.push(...hijosCl.flatMap((it) => mk(it.nombre, it.cantidad)));
    }
  }
  // 2) Respaldo: Ollama interpreta descripciones libres que el parser no cubre
  if (!tree) {
    try {
      const url = process.env.OLLAMA_URL || 'http://host.docker.internal:11434';
      const model = process.env.OLLAMA_MODEL || 'llama3.2:1b';
      const prompt = `Convierte una descripción de estructura organizacional (en español) a un árbol JSON.
Reglas:
- Devuelve SOLO JSON válido, sin texto extra ni markdown: {"nombre":"...","tipo":"gerencia","hijos":[...]}
- "tipo" es "gerencia" para gerencias/presidencias/direcciones y "unidad" para el resto.
- Si menciona cantidades ("3 analistas"), genera ese número exacto de hijos numerados ("Analista 1", "Analista 2", "Analista 3").
- Los nombres deben ser los cargos/departamentos que describe el usuario, con su nombre real (ej "Gerencia de Recursos Humanos"), no genéricos.

Ejemplo 1:
Descripción: "una gerencia de recursos humanos con 3 líderes y cada líder 2 analistas"
{"nombre":"Gerencia de Recursos Humanos","tipo":"gerencia","hijos":[
  {"nombre":"Líder 1","tipo":"unidad","hijos":[{"nombre":"Analista 1","tipo":"unidad","hijos":[]},{"nombre":"Analista 2","tipo":"unidad","hijos":[]}]},
  {"nombre":"Líder 2","tipo":"unidad","hijos":[{"nombre":"Analista 1","tipo":"unidad","hijos":[]},{"nombre":"Analista 2","tipo":"unidad","hijos":[]}]},
  {"nombre":"Líder 3","tipo":"unidad","hijos":[{"nombre":"Analista 1","tipo":"unidad","hijos":[]},{"nombre":"Analista 2","tipo":"unidad","hijos":[]}]}
]}

Ejemplo 2:
Descripción: "una presidencia con una gerencia de operaciones y una gerencia de finanzas"
{"nombre":"Presidencia","tipo":"gerencia","hijos":[
  {"nombre":"Gerencia de Operaciones","tipo":"gerencia","hijos":[]},
  {"nombre":"Gerencia de Finanzas","tipo":"gerencia","hijos":[]}
]}

Descripción: "${texto}"`;
      const r = await fetch(`${url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, format: 'json' }),
      });
      if (r.ok) {
        const { response } = await r.json();
        try {
          const t = JSON.parse(response);
          if (t?.nombre) tree = t;
        } catch { /* sin árbol */ }
      }
    } catch { /* Ollama inalcanzable */ }
  }
  if (!tree) return res.status(502).json({ error: 'No pude interpretar la descripción — intenta "una gerencia con N hijos y cada hijo M sub-hijos"' });

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
