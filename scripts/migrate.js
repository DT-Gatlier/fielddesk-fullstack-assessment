const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const backendRequire = createRequire(path.resolve(__dirname, '../backend/package.json'));
const dotenv = backendRequire('dotenv');
const { Client } = backendRequire('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://fielddesk:fielddesk123@localhost:5432/fielddesk';

async function runMigrations() {
  const migrationsDir = path.resolve(__dirname, '../database/migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d+.*\.sql$/i.test(f))
    .sort();

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const appliedRes = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(appliedRes.rows.map((r) => r.filename));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] Skipping already-applied migration: ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`[migrate] Applying ${file}...`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] Applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration '${file}' failed: ${err.message}`);
      }
    }

    console.log('[migrate] All database migrations complete.');
  } finally {
    await client.end();
  }
}

runMigrations().catch((err) => {
  console.error('[migrate] Error:', err.message);
  process.exit(1);
});

