import pg from 'pg';
import { config } from './config';
import { logger } from './logger';

// Return BIGINT (int8) columns as JS numbers. Our bigint values (byte counts,
// audit ids) stay far below Number.MAX_SAFE_INTEGER.
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  // Fail fast rather than queueing forever when the database is unhealthy.
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  application_name: process.env.SERVICE_NAME ?? 'fielddesk',
});

pool.on('error', (err) => logger.error({ err }, 'unexpected idle database client error'));

export type Db = pg.Pool | pg.PoolClient;
export type Tx = pg.PoolClient;

/**
 * Runs `fn` inside a single database transaction (READ COMMITTED).
 * Commits when `fn` resolves and rolls back on any thrown error, so callers
 * never leave partial changes behind.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // A lock wait longer than this is treated as an error instead of hanging a request.
    await client.query("SET LOCAL lock_timeout = '5s'");
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch((rollbackErr) =>
      logger.error({ err: rollbackErr }, 'rollback failed'),
    );
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
