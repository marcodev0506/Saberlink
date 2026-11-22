// Asigna la imagen genérica a todos los cursos sin imagen.
// Uso: docker compose exec api node src/scripts/imagenes-default.js
import { pool } from '../db.js';

const DEFAULT_IMG = '/app/src/assets/default-curso.png';

const { rowCount } = await pool.query(
  `UPDATE cursos SET imagen_path = $1 WHERE imagen_path IS NULL OR imagen_path = ''`,
  [DEFAULT_IMG]
);
console.log(`${rowCount} cursos actualizados con imagen por defecto`);
process.exit(0);
