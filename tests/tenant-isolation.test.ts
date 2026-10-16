import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SeedResult } from '../backend/src/db/seed-data';
import { createTestApp, loginAs, pool, resetData, window, type Agent, type TestContext } from './helpers';

/**
 * Every test logs in as an Acme user and manipulates IDs, URLs or payloads to
 * point at Brightline data. The expected result is always "not found" (or a
 * validation error), and Brightline data must be unchanged afterwards.
 */
let ctx: TestContext;
let seed: SeedResult;
let acmeDispatcher: Agent;
let acmeOwner: Agent;

beforeAll(async () => {
  ctx = await createTestApp();
});
beforeEach(async () => {
  seed = await resetData(ctx.redis);
  acmeDispatcher = await loginAs(ctx.app, 'dispatcher@acme.test');
  acmeOwner = await loginAs(ctx.app, 'owner@acme.test');
});
afterAll(() => ctx.close());

const brightlineSnapshot = async () =>
  (await pool.query(
    `SELECT w.id, w.title, w.status, w.technician_id, w.version FROM work_orders w
       JOIN organisations o ON o.id = w.org_id WHERE o.slug = 'brightline' ORDER BY w.id`,
  )).rows;

describe('cross-organisation access is impossible', () => {
  it('reading another organisation’s work order by ID returns 404', async () => {
    const foreign = seed.brightline!.workOrders[0]!.id;
    for (const path of [`/api/work-orders/${foreign}`, `/api/work-orders/${foreign}/activity`]) {
      const res = await acmeDispatcher.get(path);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(JSON.stringify(res.body)).not.toContain('Brightline');
    }
  });

  it('modifying another organisation’s work order returns 404 and changes nothing', async () => {
    const before = await brightlineSnapshot();
    const foreign = seed.brightline!.workOrders[0]!.id;
    const results = await Promise.all([
      acmeDispatcher.patch(`/api/work-orders/${foreign}`).send({ title: 'pwned' }),
      acmeDispatcher.post(`/api/work-orders/${foreign}/status`).send({ status: 'cancelled' }),
      acmeDispatcher.put(`/api/work-orders/${foreign}/assignment`).send({
        technicianId: seed.acme!.users.tech1!.id, ...window(100, 101),
      }),
    ]);
    for (const res of results) expect(res.status).toBe(404);
    expect(await brightlineSnapshot()).toEqual(before);
  });

  it('assigning another organisation’s technician to our work order is rejected', async () => {
    const ours = seed.acme!.workOrders.find((w) => w.technicianId === null)!;
    const res = await acmeDispatcher.put(`/api/work-orders/${ours.id}/assignment`).send({
      technicianId: seed.brightline!.users.tech1!.id, ...window(10, 11),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TECHNICIAN');
  });

  it('creating a work order cannot target another organisation via the payload', async () => {
    const res = await acmeDispatcher.post('/api/work-orders').send({
      title: 'Smuggled', priority: 'low', siteName: 'x', orgId: seed.brightline!.id,
    });
    expect(res.status).toBe(400);
    const res2 = await acmeDispatcher.post('/api/work-orders').send({
      title: 'Smuggled', priority: 'low', siteName: 'x', technicianId: seed.brightline!.users.tech1!.id, ...window(1, 2),
    });
    expect(res2.status).toBe(400);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM work_orders WHERE title = 'Smuggled'");
    expect(rows[0].n).toBe(0);
  });

  it('list and search never return another organisation’s rows, whatever the filters', async () => {
    const queries = [
      '/api/work-orders?pageSize=100',
      '/api/work-orders?q=brightline',
      `/api/work-orders?technicianId=${seed.brightline!.users.tech1!.id}`,
      '/api/work-orders?q=%25', // a literal "%" must not act as a wildcard
    ];
    for (const q of queries) {
      const res = await acmeDispatcher.get(q);
      expect(res.status).toBe(200);
      for (const wo of res.body.data) expect(wo.title.startsWith('Acme')).toBe(true);
    }
    const tech = await acmeDispatcher.get(`/api/work-orders?technicianId=${seed.brightline!.users.tech1!.id}`);
    expect(tech.body.data).toHaveLength(0);
  });

  it('dashboard counts are organisation-scoped', async () => {
    const res = await acmeDispatcher.get('/api/work-orders/summary');
    expect(res.body.data.total).toBe(seed.acme!.workOrders.length);
  });

  it('managing a user of another organisation returns 404', async () => {
    const foreignUser = seed.brightline!.users.dispatcher!.id;
    const res = await acmeOwner.patch(`/api/users/${foreignUser}`).send({ role: 'technician' });
    expect(res.status).toBe(404);
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [foreignUser]);
    expect(rows[0].role).toBe('dispatcher');
    const list = await acmeOwner.get('/api/users');
    expect(list.body.data.every((u: { email: string }) => u.email.endsWith('@acme.test'))).toBe(true);
  });

  it('technicians cannot submit progress events for another organisation’s work order', async () => {
    const tech = await loginAs(ctx.app, 'tech1@acme.test');
    const before = await brightlineSnapshot();
    const res = await tech.post('/api/progress-events').send({
      eventId: 'evt-cross-1', workOrderId: seed.brightline!.workOrders[0]!.id, type: 'status_changed',
      occurredAt: new Date().toISOString(), payload: { status: 'completed' },
    });
    expect(res.status).toBe(404);
    expect(await brightlineSnapshot()).toEqual(before);
  });

  it('the organisation endpoint only ever returns the caller’s organisation', async () => {
    const res = await acmeOwner.get('/api/organisation').query({ id: seed.brightline!.id });
    expect(res.body.data.id).toBe(seed.acme!.id);
  });

  it('the database itself refuses cross-organisation references (composite foreign keys)', async () => {
    const acmeWo = seed.acme!.workOrders[3]!.id;
    await expect(
      pool.query(
        `UPDATE work_orders SET technician_id = $1, scheduled_start = now(), scheduled_end = now() + interval '1 hour' WHERE id = $2`,
        [seed.brightline!.users.tech1!.id, acmeWo],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
