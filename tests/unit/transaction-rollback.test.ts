import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { newDb } from 'pg-mem';
import {
  getDbPool,
  isUsingMockDb,
  resetMockWorkOrders,
  setUseMockDb,
  withTransaction,
} from '@/infrastructure/db.js';
import { getRedisClient } from '@/infrastructure/redis.js';
import { eventService } from '@/services/event.service.js';
import { auditService } from '@/services/audit.service.js';
import type { TenantContext } from '@/domain/models/tenant-context.js';

function createTransactionalMemClient() {
  const memDb = newDb();
  memDb.public.none(`
    CREATE TABLE work_order_notes (
      id TEXT PRIMARY KEY,
      body TEXT NOT NULL
    );
  `);

  const { Pool } = memDb.adapters.createPg();
  const memPool = new Pool();
  let savepoint = memDb.backup();
  const commands: string[] = [];
  let released = false;

  const client = {
    query: vi.fn(async (sql: string, params?: any[]) => {
      const cmd = String(sql).trim().toUpperCase();
      commands.push(cmd);

      if (cmd === 'BEGIN') {
        savepoint = memDb.backup();
        return { rows: [], rowCount: 0, command: 'BEGIN', oid: 0, fields: [] };
      }
      if (cmd === 'ROLLBACK') {
        savepoint.restore();
        return { rows: [], rowCount: 0, command: 'ROLLBACK', oid: 0, fields: [] };
      }
      if (cmd === 'COMMIT') {
        return { rows: [], rowCount: 0, command: 'COMMIT', oid: 0, fields: [] };
      }

      const rawClient = await memPool.connect();
      return rawClient.query(sql, params);
    }),
    release: vi.fn(() => {
      released = true;
    }),
  };

  return {
    memDb,
    client,
    commands,
    isReleased: () => released,
  };
}

describe('Feature 10 Unit & Integration: Transaction Rollback on Failure', () => {
  let prevMockFlag: boolean;

  beforeEach(async () => {
    prevMockFlag = isUsingMockDb();
    const redis = getRedisClient();
    await redis.flushall();
    resetMockWorkOrders();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setUseMockDb(prevMockFlag);
  });

  it('executes SQL BEGIN -> ROLLBACK and leaves zero persisted rows when withTransaction throws', async () => {
    const { memDb, client, commands, isReleased } = createTransactionalMemClient();
    vi.spyOn(getDbPool(), 'connect').mockResolvedValue(client as any);
    setUseMockDb(false);

    await expect(
      withTransaction(async (txClient) => {
        expect(txClient).not.toBeNull();
        await txClient!.query(
          `INSERT INTO work_order_notes (id, body) VALUES ($1, $2)`,
          ['note-rollback-1', 'Should never commit']
        );
        throw new Error('Simulated mid-transaction failure');
      })
    ).rejects.toThrow('Simulated mid-transaction failure');

    expect(commands).toContain('BEGIN');
    expect(commands).toContain('ROLLBACK');
    expect(commands).not.toContain('COMMIT');
    expect(isReleased()).toBe(true);

    const rows = memDb.public.many(`SELECT * FROM work_order_notes`);
    expect(rows).toHaveLength(0);
  });

  it('executes SQL BEGIN -> COMMIT and persists rows when withTransaction succeeds', async () => {
    const { memDb, client, commands, isReleased } = createTransactionalMemClient();
    vi.spyOn(getDbPool(), 'connect').mockResolvedValue(client as any);
    setUseMockDb(false);

    const insertedId = await withTransaction(async (txClient) => {
      await txClient!.query(
        `INSERT INTO work_order_notes (id, body) VALUES ($1, $2)`,
        ['note-commit-1', 'Committed safely']
      );
      return 'note-commit-1';
    });

    expect(insertedId).toBe('note-commit-1');
    expect(commands).toContain('BEGIN');
    expect(commands).toContain('COMMIT');
    expect(commands).not.toContain('ROLLBACK');
    expect(isReleased()).toBe(true);

    const rows = memDb.public.many(`SELECT * FROM work_order_notes`);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe('Committed safely');
  });

  it('clears in-flight Redis idempotency lock when eventService.processEvent fails mid-transaction', async () => {
    const ctx: TenantContext = {
      organisationId: 'org-apex-01',
      userId: '11111111-1111-1111-1111-111111111103',
      role: 'technician',
      correlationId: 'tx-rollback-evt-1',
    };

    const eventId = `evt-rollback-${Date.now()}`;
    const recordSpy = vi
      .spyOn(auditService, 'record')
      .mockRejectedValueOnce(new Error('Audit write failure'));

    await expect(
      eventService.processEvent(ctx, '10000000-0000-0000-0000-000000000001', {
        eventId,
        workOrderId: '10000000-0000-0000-0000-000000000001',
        type: 'status_changed',
        occurredAt: new Date().toISOString(),
        payload: { status: 'in_progress', note: 'Attempt 1' },
      })
    ).rejects.toThrow('Audit write failure');

    expect(recordSpy).toHaveBeenCalledTimes(1);

    // Ensure Redis fast-path lock was cleared so client can safely retry
    const redis = getRedisClient();
    const lockValue = await redis.get(`idemp:org-apex-01:${eventId}`);
    expect(lockValue).toBeNull();
  });
});
