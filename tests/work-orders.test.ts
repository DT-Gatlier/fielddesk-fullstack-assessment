import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SeedResult } from '../backend/src/db/seed-data';
import { createTestApp, createWorkOrder, loginAs, pool, resetData, window, type Agent, type TestContext } from './helpers';

let ctx: TestContext;
let seed: SeedResult;
let dispatcher: Agent;

beforeAll(async () => {
  ctx = await createTestApp();
});
beforeEach(async () => {
  seed = await resetData(ctx.redis);
  dispatcher = await loginAs(ctx.app, 'dispatcher@acme.test');
});
afterAll(() => ctx.close());

describe('work-order validation', () => {
  const valid = { title: 'Fix boiler', priority: 'high', siteName: 'Plant A' };
  const cases: [string, Record<string, unknown>, string][] = [
    ['missing title', { ...valid, title: undefined }, 'title'],
    ['blank title', { ...valid, title: '   ' }, 'title'],
    ['overlong title', { ...valid, title: 'x'.repeat(201) }, 'title'],
    ['unknown priority', { ...valid, priority: 'critical' }, 'priority'],
    ['end before start', { ...valid, scheduledStart: '2030-01-01T10:00:00Z', scheduledEnd: '2030-01-01T09:00:00Z' }, 'scheduledEnd'],
    ['zero-length window', { ...valid, scheduledStart: '2030-01-01T10:00:00Z', scheduledEnd: '2030-01-01T10:00:00Z' }, 'scheduledEnd'],
    ['start without end', { ...valid, scheduledStart: '2030-01-01T10:00:00Z' }, 'scheduledEnd'],
    ['timestamp without timezone', { ...valid, scheduledStart: '2030-01-01T10:00:00', scheduledEnd: '2030-01-01T11:00:00' }, 'scheduledStart'],
    ['window longer than 14 days', { ...valid, scheduledStart: '2030-01-01T00:00:00Z', scheduledEnd: '2030-02-01T00:00:00Z' }, 'scheduledEnd'],
    ['technician without schedule', { ...valid, technicianId: '00000000-0000-4000-8000-000000000000' }, 'scheduledStart'],
    ['client-set status', { ...valid, status: 'completed' }, ''],
  ];
  it.each(cases)('rejects %s', async (_name, body, field) => {
    const res = await dispatcher.post('/api/work-orders').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.requestId).toBeTruthy();
    if (field) expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(field);
  });

  it('rejects malformed IDs in the URL', async () => {
    const res = await dispatcher.get('/api/work-orders/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('rejects a technician ID that is not a technician', async () => {
    const res = await dispatcher.post('/api/work-orders').send({
      ...valid, technicianId: seed.acme!.users.dispatcher!.id, ...window(1, 2),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TECHNICIAN');
  });
});

describe('work-order lifecycle', () => {
  it('creates a work order with a per-organisation reference, creator and timestamps', async () => {
    const res = await dispatcher.post('/api/work-orders').send({
      title: 'New job', description: 'desc', priority: 'urgent', siteName: 'Depot',
      technicianId: seed.acme!.users.tech1!.id, ...window(1, 3),
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      reference: 'WO-00007', status: 'open', priority: 'urgent', siteName: 'Depot',
      technician: { id: seed.acme!.users.tech1!.id, name: 'Tom Technician' },
      createdBy: { id: seed.acme!.users.dispatcher!.id },
    });
    expect(res.body.data.createdAt).toBeTruthy();
    // Brightline's numbering is independent.
    const bDispatcher = await loginAs(ctx.app, 'dispatcher@brightline.test');
    const b = await createWorkOrder(bDispatcher);
    expect(b.reference).toBe('WO-00007');
  });

  it('edits fields, enforces optimistic versions and records before/after in the audit log', async () => {
    const wo = await createWorkOrder(dispatcher);
    const ok = await dispatcher.patch(`/api/work-orders/${wo.id}`).send({ title: 'Renamed', version: wo.version });
    expect(ok.status).toBe(200);
    expect(ok.body.data.version).toBe(wo.version + 1);

    const stale = await dispatcher.patch(`/api/work-orders/${wo.id}`).send({ title: 'Stale edit', version: wo.version });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');

    const { rows } = await pool.query("SELECT before, after FROM audit_log WHERE action = 'work_order.updated' AND target_id = $1", [wo.id]);
    expect(rows).toEqual([{ before: { title: 'Test work order' }, after: { title: 'Renamed' } }]);
  });

  it('follows the status state machine', async () => {
    const wo = await createWorkOrder(dispatcher, { technicianId: seed.acme!.users.tech1!.id, ...window(5, 6) });
    const start = await dispatcher.post(`/api/work-orders/${wo.id}/status`).send({ status: 'in_progress' });
    expect(start.status).toBe(200);
    expect((await dispatcher.post(`/api/work-orders/${wo.id}/status`).send({ status: 'completed' })).status).toBe(200);
    const reopen = await dispatcher.post(`/api/work-orders/${wo.id}/status`).send({ status: 'open' });
    expect(reopen.status).toBe(409);
    expect(reopen.body.error.code).toBe('INVALID_TRANSITION');
    const edit = await dispatcher.patch(`/api/work-orders/${wo.id}`).send({ title: 'after close' });
    expect(edit.body.error.code).toBe('WORK_ORDER_CLOSED');
  });

  it('cannot start work without an assigned technician', async () => {
    const wo = await createWorkOrder(dispatcher);
    const res = await dispatcher.post(`/api/work-orders/${wo.id}/status`).send({ status: 'in_progress' });
    expect(res.status).toBe(409);
  });

  it('shows the full activity history for a work order', async () => {
    const wo = await createWorkOrder(dispatcher);
    await dispatcher.put(`/api/work-orders/${wo.id}/assignment`).send({ technicianId: seed.acme!.users.tech1!.id, ...window(7, 8) });
    await dispatcher.post(`/api/work-orders/${wo.id}/status`).send({ status: 'on_hold', note: 'waiting for parts' });
    const res = await dispatcher.get(`/api/work-orders/${wo.id}/activity`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((a: { action: string }) => a.action)).toEqual([
      'work_order.created', 'work_order.assignment_changed', 'work_order.status_changed',
    ]);
    const status = res.body.data[2];
    expect(status).toMatchObject({
      actor: { type: 'user', id: seed.acme!.users.dispatcher!.id, name: 'Dan Dispatcher' },
      before: { status: 'open' }, after: { status: 'on_hold' }, metadata: { note: 'waiting for parts' },
    });
  });

  it('audit history cannot be edited, through the API or directly in the database', async () => {
    const wo = await createWorkOrder(dispatcher);
    const owner = await loginAs(ctx.app, 'owner@acme.test');
    for (const method of ['patch', 'delete', 'put'] as const) {
      expect((await owner[method]('/api/organisation/audit-log').send({})).status).toBe(404);
    }
    await expect(pool.query("UPDATE audit_log SET action = 'tampered' WHERE work_order_id = $1", [wo.id])).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM audit_log WHERE work_order_id = $1', [wo.id])).rejects.toThrow(/append-only/);
  });
});

describe('list: search, filter, sort, paginate', () => {
  beforeEach(async () => {
    for (const [i, p] of (['low', 'medium', 'high', 'urgent', 'low'] as const).entries()) {
      await createWorkOrder(dispatcher, { title: `Pump ${i}`, priority: p, siteName: i % 2 ? 'East Wing' : 'West Wing' });
    }
  });

  it('searches title, site and reference case-insensitively', async () => {
    expect((await dispatcher.get('/api/work-orders?q=PUMP')).body.meta.total).toBe(5);
    expect((await dispatcher.get('/api/work-orders?q=east wing')).body.meta.total).toBe(2);
    expect((await dispatcher.get('/api/work-orders?q=WO-00001')).body.data[0].reference).toBe('WO-00001');
  });

  it('filters by status, priority and technician', async () => {
    const urgent = await dispatcher.get('/api/work-orders?priority=urgent,high');
    expect(urgent.body.data.every((w: { priority: string }) => ['urgent', 'high'].includes(w.priority))).toBe(true);
    const open = await dispatcher.get('/api/work-orders?status=open&q=pump');
    expect(open.body.meta.total).toBe(5);
    const unassigned = await dispatcher.get('/api/work-orders?technicianId=unassigned');
    expect(unassigned.body.data.every((w: { technician: unknown }) => w.technician === null)).toBe(true);
    const bad = await dispatcher.get('/api/work-orders?status=open,bogus');
    expect(bad.status).toBe(400);
  });

  it('sorts by priority and title in both directions', async () => {
    const desc = await dispatcher.get('/api/work-orders?q=pump&sort=priority&order=desc');
    expect(desc.body.data.map((w: { priority: string }) => w.priority)).toEqual(['urgent', 'high', 'medium', 'low', 'low']);
    const asc = await dispatcher.get('/api/work-orders?q=pump&sort=title&order=asc');
    expect(asc.body.data.map((w: { title: string }) => w.title)).toEqual(['Pump 0', 'Pump 1', 'Pump 2', 'Pump 3', 'Pump 4']);
    expect((await dispatcher.get('/api/work-orders?sort=password_hash')).status).toBe(400);
  });

  it('paginates with stable totals', async () => {
    const p1 = await dispatcher.get('/api/work-orders?q=pump&sort=title&order=asc&pageSize=2&page=1');
    const p3 = await dispatcher.get('/api/work-orders?q=pump&sort=title&order=asc&pageSize=2&page=3');
    expect(p1.body.meta).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    expect(p1.body.data.map((w: { title: string }) => w.title)).toEqual(['Pump 0', 'Pump 1']);
    expect(p3.body.data.map((w: { title: string }) => w.title)).toEqual(['Pump 4']);
    expect((await dispatcher.get('/api/work-orders?pageSize=1000')).status).toBe(400);
  });

  it('returns dashboard summary counts', async () => {
    const res = await dispatcher.get('/api/work-orders/summary');
    expect(res.body.data).toMatchObject({ total: 11, unassigned: 6 });
    expect(res.body.data.byStatus.open).toBe(8);
  });
});
