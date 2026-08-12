import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { createPool } from './pool.js';

const config = loadConfig();
const database = createPool(config);
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../database/migrations');

try {
  await database.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  for (const filename of files) {
    const exists = await database.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
    if (exists.rowCount) continue;
    const sql = await readFile(path.join(directory, filename), 'utf8');
    const client = await database.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [filename]);
      await client.query('COMMIT');
      console.info(`Applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await database.end();
}
