import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SeedResult } from '../backend/src/db/seed-data';
import { createTestApp, createWorkOrder, loginAs, pool, resetData, window, type TestContext } from './helpers';

let ctx: TestContext;
let seed: SeedResult;

beforeAll(async () => {
  ctx = await createTestApp();
});
beforeEach(async () => {
  seed = await resetData(ctx.redis);
});
afterAll(() => ctx.close());

describe('role permissions are enforced by the API', () => {
  it('technicians cannot create, edit, assign or export work orders', async () => {
    const tech = await loginAs(ctx.app, 'tech1@acme.test');
    const assigned = seed.acme!.workOrders.find((w) => w.technicianId === seed.acme!.users.tech1!.id)!;
    const attempts = await Promise.all([
      tech.post('/api/work-orders').send({ title: 'x', priority: 'low', siteName: 'y' }),
      tech.patch(`/api/work-orders/${assigned.id}`).send({ title: 'hijacked' }),
      tech.put(`/api/work-orders/${assigned.id}/assignment`).send({ technicianId: null, scheduledStart: null, scheduledEnd: null }),
      tech.post(`/api/work-orders/${assigned.id}/status`).send({ status: 'cancelled' }),
      tech.get('/api/work-orders/export.csv'),
      tech.get('/api/users'),
    ]);
    for (const res of attempts) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    const { rows } = await pool.query('SELECT title FROM work_orders WHERE id = $1', [assigned.id]);
    expect(rows[0].title).not.toBe('hijacked');
  });

  it('technicians only see work orders assigned to them', async () => {
    const tech = await loginAs(ctx.app, 'tech1@acme.test');
    const tech1Id = seed.acme!.users.tech1!.id;
    const list = await tech.get('/api/work-orders?pageSize=100');
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    expect(list.body.data.every((w: { technician: { id: string } }) => w.technician?.id === tech1Id)).toBe(true);

    const other = seed.acme!.workOrders.find((w) => w.technicianId !== tech1Id)!;
    expect((await tech.get(`/api/work-orders/${other.id}`)).status).toBe(404);
    expect((await tech.get(`/api/work-orders/${other.id}/activity`)).status).toBe(404);

    const summary = await tech.get('/api/work-orders/summary');
    expect(summary.body.data.total).toBe(list.body.meta.total);
  });

  it('dispatchers cannot manage users, organisation settings or read the audit log', async () => {
    const dispatcher = await loginAs(ctx.app, 'dispatcher@acme.test');
    const techId = seed.acme!.users.tech1!.id;
    expect((await dispatcher.patch(`/api/users/${techId}`).send({ role: 'owner' })).status).toBe(403);
    expect((await dispatcher.post('/api/users').send({ email: 'a@b.test', name: 'A', role: 'owner', password: 'long-enough-password' })).status).toBe(403);
    expect((await dispatcher.patch('/api/organisation').send({ name: 'Renamed' })).status).toBe(403);
    expect((await dispatcher.get('/api/organisation/audit-log')).status).toBe(403);
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [techId]);
    expect(rows[0].role).toBe('technician');
  });

  it('only technicians submit progress events', async () => {
    const dispatcher = await loginAs(ctx.app, 'dispatcher@acme.test');
    const res = await dispatcher.post('/api/progress-events').send({
      eventId: 'evt-d-1', workOrderId: seed.acme!.workOrders[0]!.id, type: 'note_added',
      occurredAt: new Date().toISOString(), payload: { note: 'hi' },
    });
    expect(res.status).toBe(403);
  });

  it('owners can change roles, and the change is audited with before/after values', async () => {
    const owner = await loginAs(ctx.app, 'owner@acme.test');
    const dispatcherId = seed.acme!.users.dispatcher!.id;
    const res = await owner.patch(`/api/users/${dispatcherId}`).send({ role: 'technician' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('technician');
    const { rows } = await pool.query(
      "SELECT actor_id, before, after FROM audit_log WHERE action = 'user.role_changed' AND target_id = $1",
      [dispatcherId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_id: seed.acme!.users.owner!.id, before: { role: 'dispatcher' }, after: { role: 'technician' } });
  });

  it('a role change applies on the very next request (role is not cached in the session)', async () => {
    const dispatcher = await loginAs(ctx.app, 'dispatcher@acme.test');
    const owner = await loginAs(ctx.app, 'owner@acme.test');
    expect((await dispatcher.post('/api/work-orders').send({ title: 'ok', priority: 'low', siteName: 's' })).status).toBe(201);
    await owner.patch(`/api/users/${seed.acme!.users.dispatcher!.id}`).send({ role: 'technician' });
    expect((await dispatcher.post('/api/work-orders').send({ title: 'no', priority: 'low', siteName: 's' })).status).toBe(403);
  });

  it('a client-supplied role or organisation in the body is rejected, not trusted', async () => {
    const dispatcher = await loginAs(ctx.app, 'dispatcher@acme.test');
    const res = await dispatcher.post('/api/work-orders').send({
      title: 'x', priority: 'low', siteName: 'y', orgId: seed.brightline!.id, role: 'owner', createdBy: seed.brightline!.users.owner!.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('owners cannot lock themselves out', async () => {
    const owner = await loginAs(ctx.app, 'owner@acme.test');
    const res = await owner.patch(`/api/users/${seed.acme!.users.owner!.id}`).send({ role: 'technician' });
    expect(res.status).toBe(400);
  });

  it('a technician with active work cannot be demoted until it is reassigned', async () => {
    const owner = await loginAs(ctx.app, 'owner@acme.test');
    const dispatcher = await loginAs(ctx.app, 'dispatcher@acme.test');
    await createWorkOrder(dispatcher, { technicianId: seed.acme!.users.tech2!.id, ...window(1, 2) });
    const res = await owner.patch(`/api/users/${seed.acme!.users.tech2!.id}`).send({ role: 'dispatcher' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USER_HAS_ACTIVE_ASSIGNMENTS');
  });
});
