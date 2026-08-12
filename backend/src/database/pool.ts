import pg from 'pg';
import type { Config } from '../config.js';

const { Pool } = pg;

export type Database = pg.Pool;

export function createPool(config: Config): Database {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: config.NODE_ENV === 'test' ? 5 : 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
}

export async function inTransaction<T>(database: Database, operation: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
