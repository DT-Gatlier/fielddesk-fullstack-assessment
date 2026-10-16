import { testEnv } from './test-env';

/** Recreates the test schema from the real migration files once per run. */
export default async function setup() {
  Object.assign(process.env, testEnv);
  const pg = (await import('pg')).default;
  const { resetSchema, runMigrations } = await import('../backend/src/db/migrator');
  const pool = new pg.Pool({ connectionString: testEnv.DATABASE_URL });
  try {
    await resetSchema(pool);
    await runMigrations(pool);
  } catch (err) {
    throw new Error(
      `Test database setup failed (${(err as Error).message}). ` +
        'Start PostgreSQL and Redis first: docker compose up -d postgres redis',
    );
  } finally {
    await pool.end();
  }
}
