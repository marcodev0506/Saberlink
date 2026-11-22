// Genera una portada SVG única por curso (icono temático + gradiente) y la
// guarda en storage/imagenes/<id>.svg como imagen del curso.
// Uso: docker compose exec api node src/scripts/imagenes-cursos.js
// Opción: SOLO_VACIOS=1 → solo cursos sin imagen (por defecto sobrescribe todas).
import { mkdir, writeFile } from 'node:fs/promises';
import { pool } from '../db.js';

const DIR = `${process.env.STORAGE_DIR}/imagenes`;

const ICONOS = [
  [/segur|incendio|emergen|riesgo|higiene|salud|primeros|ambiente/i, '🛡️'],
  [/electric/i, '⚡'],
  [/informa|automatiza|telecom|tecnolog|digital|software/i, '💻'],
  [/lider|supervis|geren|direcci|gestion|administra|planif|estrateg/i, '📊'],
  [/mante|mecan|ingenier|proyecto|equipo|industri/i, '⚙️'],
  [/finanza|costo|presupuesto|contab|econom/i, '💰'],
  [/legal|norma|etica|conducta|reglamento|contrat/i, '⚖️'],
  [/comunic|redacci|redac|informe|present/i, '📝'],
  [/operaci|proces|transport|logist|almacen|cargas|glP|petrol/i, '🛢️'],
  [/calidad|iso|auditor/i, '✅'],
  [/formaci|facilita|tutor|inducci|capacita|aprendiz|educa/i, '🎓'],
  [/sociopolit|politica|comunidad|social|responsabilidad/i, '🤝'],
  [/calibr|laboratorio|inspecc|prueba/i, '🔬'],
];

const PALETAS = [
  ['#05284B', '#0b3a68', '#EC6A11'],
  ['#0b3a68', '#125187', '#EC6A11'],
  ['#05284B', '#EC6A11', '#f4933f'],
  ['#1a3d6e', '#05284B', '#f4a25c'],
  ['#EC6A11', '#c95a10', '#05284B'],
  ['#05284B', '#2a5a8f', '#EC6A11'],
];

function icono(texto) {
  for (const [re, ic] of ICONOS) if (re.test(texto)) return ic;
  return '📘';
}

function paleta(titulo) {
  let h = 0;
  for (const ch of titulo) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETAS[h % PALETAS.length];
}

function svg(ic, [c1, c2, accent], titulo) {
  const t = titulo.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const lineas = [];
  for (let i = 0; i < t.length; i += 26) lineas.push(t.slice(i, i + 26));
  const y = 150 - (lineas.length - 1) * 14;
  const lines = lineas.map((l, i) => `<text x="300" y="${y + i * 28}" font-size="22" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial, sans-serif">${l}</text>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="300" fill="url(#g)"/>
  <circle cx="480" cy="-40" r="160" fill="${accent}" opacity=".18"/>
  <circle cx="60" cy="340" r="180" fill="#fff" opacity=".07"/>
  <rect x="230" y="28" width="140" height="78" rx="18" fill="#fff" opacity=".14"/>
  <text x="300" y="82" font-size="46" text-anchor="middle">${ic}</text>
  ${lines}
  <rect x="180" y="236" width="240" height="30" rx="15" fill="${accent}" opacity=".9"/>
  <text x="300" y="256" font-size="12" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="2" font-family="Arial, sans-serif">SABERLINK</text>
</svg>`;
}

await mkdir(DIR, { recursive: true });
const soloVacios = !!process.env.SOLO_VACIOS;
const { rows } = await pool.query(
  soloVacios
    ? "SELECT id, titulo, competencias FROM cursos WHERE imagen_path IS NULL OR imagen_path = ''"
    : 'SELECT id, titulo, competencias FROM cursos'
);

let n = 0;
for (const c of rows) {
  const texto = `${c.titulo} ${(c.competencias || []).join(' ')}`;
  const path = `${DIR}/${c.id}.svg`;
  await writeFile(path, svg(icono(texto), paleta(c.titulo), c.titulo.slice(0, 60)), 'utf8');
  await pool.query('UPDATE cursos SET imagen_path = $1 WHERE id = $2', [path, c.id]);
  n++;
}
console.log(`${n} portadas generadas en ${DIR}`);
process.exit(0);
