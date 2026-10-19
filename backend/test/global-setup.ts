import pg from 'pg';
import { migrate } from '../src/db/migrate.js';

/** Rebuilds the test database from the migrations once per test run. */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_MIGRATION_DATABASE_URL;
  if (!url) throw new Error('TEST_MIGRATION_DATABASE_URL is not set');
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refusing to reset a database whose name does not end in _test: ${new URL(url).pathname}`);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
  await migrate(url, () => undefined);
}
