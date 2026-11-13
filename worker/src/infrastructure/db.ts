import { Pool, QueryResult, QueryResultRow } from 'pg';
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
      logger.error({ err: err.message }, 'Unexpected database pool error in worker');
    });
  }
  return pool;
}

declare global {
  var __fielddesk_mock_audit_logs__: any[] | undefined;
}

export function getMockAuditLogs(): any[] {
  if (!globalThis.__fielddesk_mock_audit_logs__) {
    globalThis.__fielddesk_mock_audit_logs__ = [];
  }
  return globalThis.__fielddesk_mock_audit_logs__;
}

export function clearMockAuditLogs(): void {
  if (globalThis.__fielddesk_mock_audit_logs__) {
    globalThis.__fielddesk_mock_audit_logs__.length = 0;
  }
}

export async function query<R extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<R>> {
  if (config.NODE_ENV === 'test') {
    const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('insert into audit_logs')) {
      const [orgId, actorId, action, targetType, targetId, beforeState, afterState, metadata] = params || [];
      const log = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        organisation_id: orgId,
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: targetId,
        before_state: beforeState ? JSON.parse(typeof beforeState === 'string' ? beforeState : JSON.stringify(beforeState)) : null,
        after_state: afterState ? JSON.parse(typeof afterState === 'string' ? afterState : JSON.stringify(afterState)) : null,
        metadata: metadata ? JSON.parse(typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : {},
        created_at: new Date(),
      };
      getMockAuditLogs().push(log);
      return { rows: [log as unknown as R], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
    }
  }

  const p = getDbPool();
  return await p.query<R>(text, params);
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
