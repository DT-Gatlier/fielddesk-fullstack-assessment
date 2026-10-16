import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SeedResult } from '../backend/src/db/seed-data';
import { disableAllFailpoints, enableFailpoint } from '../backend/src/lib/failpoints';
import { createTestApp, loginAs, pool, resetData, type Agent, type TestContext } from './helpers';

let ctx: TestContext;
let seed: SeedResult;
let tech: Agent;
let workOrderId: string;

beforeAll(async () => {
  ctx = await createTestApp();
});
beforeEach(async () => {
  seed = await resetData(ctx.redis);
  tech = await loginAs(ctx.app, 'tech1@acme.test');
  // WO-00001: open, assigned to tech1
  workOrderId = seed.acme!.workOrders[0]!.id;
});
afterAll(() => ctx.close());

const event = (overrides: Record<string, unknown> = {}) => ({
  eventId: `evt-${randomUUID()}`,
  workOrderId,
  type: 'status_changed',
  occurredAt: new Date(Date.now() - 60_000).toISOString(),
  payload: { status: 'in_progress', note: 'Work started' },
  ...overrides,
});

const count = async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows[0].n as number;
const eventRows = (eventId: string) => count('SELECT count(*)::int AS n FROM progress_events WHERE event_id = $1', [eventId]);
const statusAudits = () => count("SELECT count(*)::int AS n FROM audit_log WHERE action = 'work_order.status_changed' AND work_order_id = $1", [workOrderId]);
const woStatus = async () => (await pool.query('SELECT status FROM work_orders WHERE id = $1', [workOrderId])).rows[0].status;

describe('progress events: acceptance and validation', () => {
  it('accepts the example event and applies the status change', async () => {
    const body = event({ eventId: 'evt-10001', occurredAt: '2026-08-04T10:30:00Z' });
    const res = await tech.post('/api/progress-events').send(body);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ eventId: 'evt-10001', workOrderStatus: 'in_progress', duplicate: false });
    expect(await woStatus()).toBe('in_progress');
    const stored = (await pool.query('SELECT type, payload, occurred_at, actor_id FROM progress_events WHERE event_id = $1', ['evt-10001'])).rows[0];
    expect(stored).toMatchObject({ type: 'status_changed', payload: { status: 'in_progress', note: 'Work started' }, actor_id: seed.acme!.users.tech1!.id });
    expect(new Date(stored.occurred_at).toISOString()).toBe('2026-08-04T10:30:00.000Z');
  });

  it('accepts notes without changing status', async () => {
    const res = await tech.post('/api/progress-events').send(event({ type: 'note_added', payload: { note: 'Parts ordered' } }));
    expect(res.status).toBe(201);
    expect(await woStatus()).toBe('open');
  });

  const invalid: [string, Record<string, unknown>][] = [
    ['an unknown event type', { type: 'deleted_everything' }],
    ['a future timestamp', { occurredAt: new Date(Date.now() + 3600_000).toISOString() }],
    ['a timestamp without timezone', { occurredAt: '2026-08-04T10:30:00' }],
    ['a non-date timestamp', { occurredAt: 'yesterday' }],
    ['a status technicians may not set', { payload: { status: 'cancelled' } }],
    ['unknown payload fields', { payload: { status: 'in_progress', sql: 'DROP TABLE' } }],
    ['unknown top-level fields', { orgId: '00000000-0000-4000-8000-000000000000' }],
    ['a malformed eventId', { eventId: 'has spaces & symbols' }],
    ['a malformed workOrderId', { workOrderId: '1 OR 1=1' }],
    ['a note that is too long', { type: 'note_added', payload: { note: 'x'.repeat(1001) } }],
  ];
  it.each(invalid)('rejects %s', async (_name, overrides) => {
    const res = await tech.post('/api/progress-events').send(event(overrides));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(await woStatus()).toBe('open');
  });

  it('rejects events for work orders not assigned to the caller', async () => {
    const other = await loginAs(ctx.app, 'tech2@acme.test');
    const res = await other.post('/api/progress-events').send(event());
    expect(res.status).toBe(404);
    expect(await woStatus()).toBe('open');
  });
});

describe('progress events: idempotency', () => {
  it('processes an eventId only once and replays the original result for retries', async () => {
    const body = event();
    const first = await tech.post('/api/progress-events').send(body);
    const second = await tech.post('/api/progress-events').send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual({ ...first.body.data, duplicate: true });
    expect(await eventRows(body.eventId)).toBe(1);
    expect(await statusAudits()).toBe(1);
  });

  it('rejects reuse of an eventId for different content', async () => {
    const body = event();
    await tech.post('/api/progress-events').send(body);
    const res = await tech.post('/api/progress-events').send({ ...body, payload: { status: 'on_hold' } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EVENT_ID_REUSED');
    expect(await woStatus()).toBe('in_progress');
  });

  it('handles 10 simultaneous duplicate submissions safely', async () => {
    const body = event();
    const results = await Promise.all(Array.from({ length: 10 }, () => tech.post('/api/progress-events').send(body)));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 200)).toHaveLength(9);
    expect(new Set(results.map((r) => r.body.data.acceptedAt)).size).toBe(1);
    expect(await eventRows(body.eventId)).toBe(1);
    expect(await statusAudits()).toBe(1);
    const version = (await pool.query('SELECT version FROM work_orders WHERE id = $1', [workOrderId])).rows[0].version;
    expect(version).toBe(2); // incremented exactly once
  });

  it('applies concurrent different events one after another without lost updates', async () => {
    const results = await Promise.all([
      tech.post('/api/progress-events').send(event({ type: 'note_added', payload: { note: 'a' } })),
      tech.post('/api/progress-events').send(event({ type: 'note_added', payload: { note: 'b' } })),
      tech.post('/api/progress-events').send(event({ type: 'note_added', payload: { note: 'c' } })),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(await count('SELECT count(*)::int AS n FROM progress_events WHERE work_order_id = $1', [workOrderId])).toBe(3);
  });

  it('stored events are immutable', async () => {
    const body = event();
    await tech.post('/api/progress-events').send(body);
    await expect(pool.query("UPDATE progress_events SET payload = '{}' WHERE event_id = $1", [body.eventId])).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM progress_events WHERE event_id = $1', [body.eventId])).rejects.toThrow(/append-only/);
  });
});

describe('progress events: transaction rollback', () => {
  it('a rejected transition leaves no event, no status change and no audit entry', async () => {
    const body = event({ payload: { status: 'completed' } }); // open -> completed is not allowed
    const res = await tech.post('/api/progress-events').send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(await eventRows(body.eventId)).toBe(0);
    expect(await statusAudits()).toBe(0);
  });

  it('a failure after the work order was updated rolls everything back atomically', async () => {
    const body = event();
    enableFailpoint('progress_event.after_update');
    const failed = await tech.post('/api/progress-events').send(body);
    expect(failed.status).toBe(500);
    expect(failed.body.error.code).toBe('INTERNAL_ERROR');
    // The status UPDATE and its audit entry ran inside the transaction, then were rolled back.
    expect(await woStatus()).toBe('open');
    expect(await statusAudits()).toBe(0);
    expect(await eventRows(body.eventId)).toBe(0);

    // The client retries the same eventId once the fault is gone: processed exactly once.
    disableAllFailpoints();
    const retry = await tech.post('/api/progress-events').send(body);
    expect(retry.status).toBe(201);
    expect(await woStatus()).toBe('in_progress');
    expect(await eventRows(body.eventId)).toBe(1);
  });
});
