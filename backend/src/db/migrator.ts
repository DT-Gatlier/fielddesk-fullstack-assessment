import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type pg from 'pg';

export const MIGRATIONS_DIR = resolve(process.env.MIGRATIONS_DIR ?? join(process.cwd(), 'database', 'migrations'));

// Arbitrary constant: only one process may apply migrations at a time, even if
// several API replicas start simultaneously.
const MIGRATION_LOCK_ID = 727_001;

/**
 * Applies pending `database/migrations/*.sql` files in filename order. Each file
 * runs in its own transaction and is recorded in schema_migrations.
 */
export async function runMigrations(pool: pg.Pool, log: (msg: string) => void = () => {}): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
    );
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
      applied.push(file);
      log(`applied ${file}`);
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}

/** Drops everything in the public schema. Development and tests only. */
export async function resetSchema(pool: pg.Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

/** Returns migration files that exist on disk but are not yet applied. */
export async function pendingMigrations(pool: pg.Pool): Promise<string[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const exists = await pool.query("SELECT to_regclass('public.schema_migrations') AS t");
  if (!exists.rows[0]?.t) return files;
  const done = new Set((await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  return files.filter((f) => !done.has(f));
}
