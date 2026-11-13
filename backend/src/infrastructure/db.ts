import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      logger.error({ err: err.message }, 'Unexpected database pool error');
    });
  }
  return pool;
}

export async function query<R extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<R>> {
  const p = getDbPool();
  return await p.query<R>(text, params);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const p = getDbPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Clean compatibility stubs for existing test harness calls
export function isUsingMockDb(): boolean {
  return false;
}

export function setUseMockDb(_val: boolean): void {
  // Real DB mode enabled
}

export function resetMockWorkOrders(): void {}
export function getMockWorkOrders(): any[] {
  return [];
}
export function getMockUsers(): any[] {
  return [];
}
export function getMockAuditLogs(): any[] {
  return [];
}
export function clearMockAuditLogs(): void {}
export function resetMockProcessedEvents(): void {}
export function getMockProcessedEvents(): any[] {
  return [];
}
export function resetMockAttachments(): void {}
export function getMockAttachments(): any[] {
  return [];
}
export function setMockOrgQuota(_orgId: string, _bytes: number): void {}
