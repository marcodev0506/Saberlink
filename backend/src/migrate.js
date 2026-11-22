import fs from 'node:fs/promises';
import { pool } from './db.js';

export async function migrate() {
  const sql = await fs.readFile('/app/db/schema.sql', 'utf8');
  await pool.query(sql);
  console.log('schema applied');
}
