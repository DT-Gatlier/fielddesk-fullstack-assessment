import { config } from 'dotenv';
import { Client } from 'pg';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadDevelopmentEnvironment } from './environment';
import { assertSafeTestDatabase } from './test-safety';

async function main(): Promise<void> {
  loadDevelopmentEnvironment();
  config({ path: resolve(__dirname, '../.env.test'), quiet: true });
  const testUrl = assertSafeTestDatabase(
    process.env.TEST_DATABASE_URL,
    process.env.DATABASE_URL,
  );
  const operation = process.argv[2];
  if (!['setup', 'reset', 'test'].includes(operation))
    throw new Error('Unknown test database operation');
  if (process.env.NODE_ENV === 'production')
    throw new Error('Test database commands are disabled in production');

  // Validate before opening a connection or spawning a destructive command.
  if (operation === 'setup') {
    const adminUrl = new URL(testUrl);
    adminUrl.pathname = '/postgres';
    const admin = new Client({
      connectionString: adminUrl.href,
      connectionTimeoutMillis: 5000,
    });
    try {
      await admin.connect();
      const existing = await admin.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        ['fielddesk_test'],
      );
      if (!existing.rowCount)
        await admin.query('CREATE DATABASE fielddesk_test');
    } finally {
      await admin.end();
    }
  }
  const env = {
    ...process.env,
    DEVELOPMENT_DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL: testUrl,
    TEST_DATABASE_URL: testUrl,
    NODE_ENV: 'test',
  };
  const run = (entrypoint: string, args: string[]): void => {
    const result = spawnSync(process.execPath, [entrypoint, ...args], {
      cwd: resolve(__dirname, '..'),
      env,
      stdio: 'inherit',
    });
    if (result.error || result.status !== 0)
      throw new Error('Test database operation failed');
  };
  if (operation === 'reset')
    run(require.resolve('prisma/build/index.js'), [
      'migrate',
      'reset',
      '--force',
    ]);
  else run(require.resolve('prisma/build/index.js'), ['migrate', 'deploy']);
  if (operation === 'test')
    run(require.resolve('tsx/cli'), [
      '--test',
      'test/database.integration.test.ts',
    ]);
}
void main().catch((error: unknown) => {
  // Never dump driver errors or connection URLs containing credentials.
  console.error(
    error instanceof Error && error.message.startsWith('Unsafe test database')
      ? error.message
      : 'Test database command failed; check the explicit test URL, permissions, and database availability',
  );
  process.exitCode = 1;
});
