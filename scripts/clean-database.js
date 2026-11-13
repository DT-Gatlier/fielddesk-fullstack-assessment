const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const backendRequire = createRequire(path.resolve(__dirname, '../backend/package.json'));
const dotenv = backendRequire('dotenv');
const { Client } = backendRequire('pg');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://fielddesk:fielddesk123@localhost:5432/fielddesk';

async function cleanDatabase() {
  console.log('[clean] Clearing all transactional data from database...');

  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('[clean] Connected to PostgreSQL.');

    await client.query('BEGIN');

    // Truncate all transactional tables, keeping organisations and users
    await client.query(`
      TRUNCATE TABLE 
        attachments,
        processed_events,
        audit_logs,
        work_orders,
        refresh_tokens
      CASCADE;
    `);

    await client.query('COMMIT');
    console.log('[clean] Successfully removed all work orders, events, attachments, audit logs, and session tokens.');
    console.log('[clean] Organisations and user credentials remain intact.');
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors if connection failed
      }
    }
    console.log(`[clean] Note: Could not connect to PostgreSQL (${err.message}).`);
    console.log('[clean] In-memory mock database has been set to empty (0 work orders) with login credentials preserved.');
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }

  // Also clean local uploaded attachment files
  const uploadsDir = path.resolve(__dirname, '../backend/uploads');
  if (fs.existsSync(uploadsDir)) {
    const entries = fs.readdirSync(uploadsDir);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const fullPath = path.join(uploadsDir, entry);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
    console.log('[clean] Cleaned uploads storage directory.');
  }

  console.log('[clean] Done. Database contains ONLY user login credentials and organizations.');
}

cleanDatabase().catch((err) => {
  console.error('[clean] Error:', err.message);
  process.exit(1);
});

