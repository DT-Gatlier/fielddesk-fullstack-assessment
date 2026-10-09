import { Client } from 'pg';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createDatabaseClient } from '../src';
import { seedDatabase } from '../prisma/seed-data';

async function main(): Promise<void> {
  const raw = process.env.E2E_DATABASE_URL;
  if (!raw || process.env.NODE_ENV === 'production')
    throw new Error('Explicit non-production E2E_DATABASE_URL required');
  const url = new URL(raw);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    decodeURIComponent(url.pathname) !== '/fielddesk_web_test' ||
    raw === process.env.DEVELOPMENT_DATABASE_URL
  ) {
    throw new Error(
      'E2E_DATABASE_URL must target the dedicated fielddesk_web_test database',
    );
  }
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.href });
  try {
    await admin.connect();
    const existing = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      ['fielddesk_web_test'],
    );
    if (!existing.rowCount)
      await admin.query('CREATE DATABASE fielddesk_web_test');
  } finally {
    await admin.end();
  }
  const target = new Client({ connectionString: raw });
  try {
    await target.connect();
    const tables = await target.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    if (tables.rowCount)
      throw new Error(
        'Web tests require a fresh empty database; refusing to change an existing schema',
      );
  } finally {
    await target.end();
  }
  const migration = spawnSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: raw, NODE_ENV: 'test' },
      stdio: 'pipe',
    },
  );
  if (migration.status !== 0) throw new Error('Web test migration failed');
  const client = createDatabaseClient(raw);
  try {
    await seedDatabase(client);
  } finally {
    await client.$disconnect();
  }
  console.log('Fresh isolated web test database migrated and seeded.');
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.message.startsWith('Web tests require')
      ? error.message
      : 'Isolated web test preparation failed; verify the explicit target and service availability.',
  );
  process.exitCode = 1;
});
