// Importa el catálogo de cursos desde /app/src/catalogo.csv
// Uso dentro del contenedor: docker compose exec api node src/scripts/importar-catalogo.js
// El CSV debe estar en backend/src/catalogo.csv (la carpeta src está montada en el contenedor).
// Columnas esperadas: habilidad ; competencia ; nombre del curso ; duración (horas)
import { readFile } from 'node:fs/promises';
import { pool } from '../db.js';

const CSV_PATH = process.env.CATALOGO_CSV || '/app/src/catalogo.csv';
const EMPRESA = process.env.EMPRESA_ID ?? null; // si no se da, usa la primera empresa

async function main() {
  const { rows: [emp] } = EMPRESA
    ? await pool.query('SELECT id FROM empresas WHERE id = $1', [EMPRESA])
    : await pool.query('SELECT id FROM empresas ORDER BY created_at LIMIT 1');
  if (!emp) { console.error('No hay empresa registrada'); process.exit(1); }

  const raw = await readFile(CSV_PATH, 'latin1'); // el CSV viene en ANSI/latin1
  const lineas = raw.split(/\r?\n/);
  let creados = 0, omitidos = 0, catalogoNuevos = 0;

  async function catalogo(tipo, nombre) {
    nombre = nombre.trim();
    if (!nombre) return;
    const r = await pool.query(
      `INSERT INTO catalogo (empresa_id, tipo, nombre) VALUES ($1, $2, $3)
       ON CONFLICT (empresa_id, tipo, nombre) DO NOTHING`,
      [emp.id, tipo, nombre]
    );
    if (r.rowCount) catalogoNuevos++;
  }

  for (const linea of lineas) {
    const cols = linea.split(';');
    const [habilidad, competencia, nombre, duracion] = cols;
    if (!nombre?.trim() || /nombre del curso/i.test(nombre) || /habilidad/i.test(habilidad ?? '')) continue;

    const dur = (duracion ?? '').trim();
    const durTxt = /^s\/?h$/i.test(dur) || dur === '' ? '' : `${dur} horas`;

    await catalogo('habilidad', habilidad ?? '');
    await catalogo('competencia', competencia ?? '');

    const r = await pool.query(
      `INSERT INTO cursos (empresa_id, titulo, duracion, competencias, habilidades)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       ON CONFLICT DO NOTHING`,
      [emp.id, nombre.trim(), durTxt,
       JSON.stringify(competencia?.trim() ? [competencia.trim()] : []),
       JSON.stringify(habilidad?.trim() ? [habilidad.trim()] : [])]
    );
    r.rowCount ? creados++ : omitidos++;
  }
  console.log(`${creados} cursos creados, ${omitidos} omitidos, ${catalogoNuevos} ítems nuevos en el banco`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
