const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const backendRequire = createRequire(path.resolve(__dirname, '../backend/package.json'));
const dotenv = backendRequire('dotenv');
const { Client } = backendRequire('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://fielddesk:fielddesk123@localhost:5432/fielddesk';

async function runSeeds() {
  const seedsDir = path.resolve(__dirname, '../database/seeds');
  const files = fs
    .readdirSync(seedsDir)
    .filter((f) => /^\d+.*\.sql$/i.test(f))
    .sort();

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
      console.log(`[seed] Executing ${file}...`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`[seed] Completed ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Seed '${file}' failed: ${err.message}`);
      }
    }

    console.log('[seed] All seed scripts executed cleanly.');
  } finally {
    await client.end();
  }
}

runSeeds().catch((err) => {
  console.error('[seed] Error:', err.message);
  process.exit(1);
});

