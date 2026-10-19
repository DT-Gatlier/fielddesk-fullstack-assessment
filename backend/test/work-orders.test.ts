import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from '../src/db/pool.js';
import {
  apiCreateWorkOrder,
  createOrg,
  createOwnerPool,
  createTestApp,
  futureWindow,
  login,
  recordedJobs,
  type TestOrg,
} from './helpers.js';

let app: FastifyInstance;
let ownerPool: Pool;
let orgA: TestOrg;
let orgB: TestOrg;
let dispatcherA: string;
let technicianA: string;
let dispatcherB: string;

beforeAll(async () => {
  app = await createTestApp();
  ownerPool = createOwnerPool();
  orgA = await createOrg(ownerPool);
  orgB = await createOrg(ownerPool);
  dispatcherA = await login(app, orgA.dispatcher.email);
  technicianA = await login(app, orgA.technician.email);
  dispatcherB = await login(app, orgB.dispatcher.email);
});

afterAll(async () => {
  await app.close();
  await ownerPool.end();
});

const create = (cookie: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/work-orders', headers: { cookie }, payload });

const patch = (cookie: string, id: string, payload: Record<string, unknown>, target = app) =>
  target.inject({ method: 'PATCH', url: `/api/work-orders/${id}`, headers: { cookie }, payload });

describe('validation', () => {
  it('reports every invalid field', async () => {
    const response = await create(dispatcherA, { title: '', priority: 'whenever' });
    expect(response.statusCode).toBe(400);
    const paths = response.json().error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['title', 'priority', 'siteName']));
  });

  it('rejects a window that ends before it starts, or only one bound', async () => {
    const reversed = await create(dispatcherA, {
      title: 'x',
      siteName: 'y',
      scheduledStart: '2031-05-01T10:00:00Z',
      scheduledEnd: '2031-05-01T09:00:00Z',
    });
    expect(reversed.statusCode).toBe(400);
    expect(reversed.json().error.details[0].path).toBe('scheduledEnd');

    const half = await create(dispatcherA, { title: 'x', siteName: 'y', scheduledStart: '2031-05-01T10:00:00Z' });
    expect(half.statusCode).toBe(400);
  });

  it('rejects client-supplied organisation and creator fields', async () => {
    const response = await create(dispatcherA, { title: 'x', siteName: 'y', orgId: orgB.id, createdBy: orgB.owner.id });
    expect(response.statusCode).toBe(400);
  });

  it('rejects assigning a technician from another organisation, or a non-technician', async () => {
    for (const assignedTechnicianId of [orgB.technician.id, orgA.dispatcher.id]) {
      const response = await create(dispatcherA, { title: 'x', siteName: 'y', assignedTechnicianId, ...futureWindow() });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('INVALID_TECHNICIAN');
    }
  });

  it('rejects malformed ids in the URL', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/work-orders/not-a-uuid', headers: { cookie: dispatcherA } });
    expect(response.statusCode).toBe(400);
  });
});

describe('creation', () => {
  it('creates a scheduled work order in the caller organisation, audits it and queues a notification', async () => {
    const window = futureWindow();
    const response = await create(dispatcherA, {
      title: 'Replace pump',
      siteName: 'Plant room',
      priority: 'high',
      assignedTechnicianId: orgA.technician.id,
      ...window,
    });
    expect(response.statusCode).toBe(201);
    const workOrder = response.json().data;
    expect(workOrder).toMatchObject({
      reference: expect.stringMatching(/^WO-\d{6}$/),
      status: 'scheduled',
      priority: 'high',
      assignedTechnician: { id: orgA.technician.id },
      createdBy: { id: orgA.dispatcher.id },
      scheduledStart: window.scheduledStart,
      version: 1,
    });

    const stored = await ownerPool.query('SELECT org_id FROM work_orders WHERE id = $1', [workOrder.id]);
    expect(stored.rows[0].org_id).toBe(orgA.id);

    const audit = await ownerPool.query('SELECT action FROM audit_log WHERE target_id = $1 ORDER BY id', [workOrder.id]);
    expect(audit.rows.map((r) => r.action)).toEqual(['work_order.created', 'work_order.assigned']);

    const notification = await ownerPool.query('SELECT id, status FROM notifications WHERE work_order_id = $1', [workOrder.id]);
    expect(notification.rows).toHaveLength(1);
    expect(recordedJobs(app)).toContainEqual({ notificationId: notification.rows[0].id, orgId: orgA.id });
  });

  it('forbids technicians from creating work orders', async () => {
    const response = await create(technicianA, { title: 'x', siteName: 'y' });
    expect(response.statusCode).toBe(403);
  });
});

describe('organisation isolation and technician scope', () => {
  it('hides other organisations’ work orders from reads, updates and lists', async () => {
    const workOrder = await apiCreateWorkOrder(app, dispatcherA, { title: 'Org A secret' });

    const read = await app.inject({ method: 'GET', url: `/api/work-orders/${workOrder.id}`, headers: { cookie: dispatcherB } });
    expect(read.statusCode).toBe(404);

    const update = await patch(dispatcherB, workOrder.id, { version: 1, title: 'hijacked' });
    expect(update.statusCode).toBe(404);
    const stored = await ownerPool.query('SELECT title FROM work_orders WHERE id = $1', [workOrder.id]);
    expect(stored.rows[0].title).toBe('Org A secret');

    const list = await app.inject({ method: 'GET', url: '/api/work-orders?q=Org%20A%20secret', headers: { cookie: dispatcherB } });
    expect(list.json().data).toHaveLength(0);
  });

  it('only shows technicians the work assigned to them', async () => {
    const mine = await apiCreateWorkOrder(app, dispatcherA, { assignedTechnicianId: orgA.technician.id, ...futureWindow() });
    const notMine = await apiCreateWorkOrder(app, dispatcherA);

    const ownRead = await app.inject({ method: 'GET', url: `/api/work-orders/${mine.id}`, headers: { cookie: technicianA } });
    expect(ownRead.statusCode).toBe(200);
    const otherRead = await app.inject({ method: 'GET', url: `/api/work-orders/${notMine.id}`, headers: { cookie: technicianA } });
    expect(otherRead.statusCode).toBe(404);

    const list = await app.inject({ method: 'GET', url: '/api/work-orders?pageSize=100', headers: { cookie: technicianA } });
    for (const workOrder of list.json().data) {
      expect(workOrder.assignedTechnician.id).toBe(orgA.technician.id);
    }
  });

  it('forbids technicians from editing work orders', async () => {
    const workOrder = await apiCreateWorkOrder(app, dispatcherA, { assignedTechnicianId: orgA.technician.id, ...futureWindow() });
    const response = await patch(technicianA, workOrder.id, { version: workOrder.version, title: 'changed' });
    expect(response.statusCode).toBe(403);
  });
});

describe('listing', () => {
  it('searches, filters, sorts and paginates', async () => {
    const org = await createOrg(ownerPool);
    const cookie = await login(app, org.dispatcher.email);
    await apiCreateWorkOrder(app, cookie, { title: 'Alpha boiler', priority: 'low' });
    await apiCreateWorkOrder(app, cookie, { title: 'Bravo boiler', priority: 'urgent' });
    await apiCreateWorkOrder(app, cookie, { title: 'Charlie lift', priority: 'urgent' });

    const get = async (query: string) =>
      (await app.inject({ method: 'GET', url: `/api/work-orders?${query}`, headers: { cookie } })).json();

    expect((await get('q=boiler')).data.map((w: { title: string }) => w.title).sort()).toEqual(['Alpha boiler', 'Bravo boiler']);
    expect((await get('priority=urgent&sort=title&order=asc')).data.map((w: { title: string }) => w.title)).toEqual([
      'Bravo boiler',
      'Charlie lift',
    ]);

    const page1 = await get('sort=title&order=asc&pageSize=2&page=1');
    const page2 = await get('sort=title&order=asc&pageSize=2&page=2');
    expect(page1.pagination).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(page2.data.map((w: { title: string }) => w.title)).toEqual(['Charlie lift']);
  });

  it('treats LIKE wildcards in search as literal text', async () => {
    const org = await createOrg(ownerPool);
    const cookie = await login(app, org.dispatcher.email);
    await apiCreateWorkOrder(app, cookie, { title: 'Ordinary job' });
    const response = await app.inject({ method: 'GET', url: '/api/work-orders?q=%25', headers: { cookie } });
    expect(response.json().data).toHaveLength(0);
  });

  it('rejects unknown sort columns', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/work-orders?sort=password_hash', headers: { cookie: dispatcherA } });
    expect(response.statusCode).toBe(400);
  });
});

describe('updates', () => {
  it('rejects an edit based on a stale version', async () => {
    const workOrder = await apiCreateWorkOrder(app, dispatcherA);
    expect((await patch(dispatcherA, workOrder.id, { version: 1, title: 'First' })).statusCode).toBe(200);
    const stale = await patch(dispatcherA, workOrder.id, { version: 1, title: 'Second' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('VERSION_CONFLICT');
  });

  it('enforces status transitions', async () => {
    const workOrder = await apiCreateWorkOrder(app, dispatcherA);
    const response = await patch(dispatcherA, workOrder.id, { version: 1, status: 'completed' });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('INVALID_TRANSITION');
  });

  it('audits field, assignment and status changes with before and after values', async () => {
    const workOrder = await apiCreateWorkOrder(app, dispatcherA, { title: 'Before' });
    const response = await patch(dispatcherA, workOrder.id, {
      version: 1,
      title: 'After',
      assignedTechnicianId: orgA.technician.id,
      ...futureWindow(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('scheduled');

    const { rows } = await ownerPool.query(
      `SELECT action, before, after FROM audit_log WHERE target_id = $1 AND action <> 'work_order.created' ORDER BY id`,
      [workOrder.id],
    );
    expect(rows.map((r) => r.action)).toEqual(['work_order.updated', 'work_order.assigned', 'work_order.status_changed']);
    expect(rows[0].before.title).toBe('Before');
    expect(rows[0].after.title).toBe('After');
    expect(rows[2]).toMatchObject({ before: { status: 'open' }, after: { status: 'scheduled' } });
  });
});

describe('scheduling conflicts', () => {
  it('returns 409 naming the conflicting work order, and allows back-to-back work', async () => {
    const org = await createOrg(ownerPool);
    const cookie = await login(app, org.dispatcher.email);
    const first = await apiCreateWorkOrder(app, cookie, {
      assignedTechnicianId: org.technician.id,
      scheduledStart: '2032-01-01T10:00:00Z',
      scheduledEnd: '2032-01-01T12:00:00Z',
    });

    const overlapping = await create(cookie, {
      title: 'x',
      siteName: 'y',
      assignedTechnicianId: org.technician.id,
      scheduledStart: '2032-01-01T11:00:00Z',
      scheduledEnd: '2032-01-01T13:00:00Z',
    });
    expect(overlapping.statusCode).toBe(409);
    expect(overlapping.json().error.code).toBe('SCHEDULE_CONFLICT');
    expect(overlapping.json().error.details[0].message).toContain(first.reference);

    const backToBack = await create(cookie, {
      title: 'x',
      siteName: 'y',
      assignedTechnicianId: org.technician.id,
      scheduledStart: '2032-01-01T12:00:00Z',
      scheduledEnd: '2032-01-01T13:00:00Z',
    });
    expect(backToBack.statusCode).toBe(201);
  });

  it('allows exactly one of many simultaneous conflicting assignments', async () => {
    const org = await createOrg(ownerPool);
    const cookie = await login(app, org.dispatcher.email);
    const workOrders = await Promise.all(Array.from({ length: 8 }, () => apiCreateWorkOrder(app, cookie)));
    const window = futureWindow(2);

    const responses = await Promise.all(
      workOrders.map((workOrder) =>
        patch(cookie, workOrder.id, { version: workOrder.version, assignedTechnicianId: org.technician.id, ...window }),
      ),
    );

    const statuses = responses.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409, 409, 409, 409]);
    for (const response of responses.filter((r) => r.statusCode === 409)) {
      expect(response.json().error.code).toBe('SCHEDULE_CONFLICT');
    }

    const { rows } = await ownerPool.query(
      `SELECT count(*)::int AS count FROM work_orders WHERE assigned_technician_id = $1 AND scheduled_start = $2`,
      [org.technician.id, window.scheduledStart],
    );
    expect(rows[0].count).toBe(1);
    // Losing requests rolled back completely: no stray notifications or audit entries.
    const notifications = await ownerPool.query('SELECT count(*)::int AS count FROM notifications WHERE org_id = $1', [org.id]);
    expect(notifications.rows[0].count).toBe(1);
  });

  it('stays correct when the conflicting requests hit different API instances', async () => {
    const second = await createTestApp();
    try {
      const org = await createOrg(ownerPool);
      const cookie = await login(app, org.dispatcher.email);
      const window = futureWindow(3);
      const body = { title: 'Race', siteName: 'Site', assignedTechnicianId: org.technician.id, ...window };

      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          (i % 2 === 0 ? app : second).inject({ method: 'POST', url: '/api/work-orders', headers: { cookie }, payload: body }),
        ),
      );
      expect(responses.filter((r) => r.statusCode === 201)).toHaveLength(1);
      expect(responses.filter((r) => r.statusCode === 409)).toHaveLength(5);
    } finally {
      await second.close();
    }
  });
});

describe('dashboard', () => {
  it('returns counts scoped to the organisation, and to the technician for technicians', async () => {
    const org = await createOrg(ownerPool);
    const dispatcher = await login(app, org.dispatcher.email);
    const technician = await login(app, org.technician.email);
    await apiCreateWorkOrder(app, dispatcher);
    await apiCreateWorkOrder(app, dispatcher, { assignedTechnicianId: org.technician.id, ...futureWindow() });

    const all = (await app.inject({ method: 'GET', url: '/api/dashboard/summary', headers: { cookie: dispatcher } })).json().data;
    expect(all).toMatchObject({ total: 2, unassigned: 1, byStatus: { open: 1, scheduled: 1 } });

    const mine = (await app.inject({ method: 'GET', url: '/api/dashboard/summary', headers: { cookie: technician } })).json().data;
    expect(mine).toMatchObject({ total: 1, byStatus: { open: 0, scheduled: 1 } });
  });
});
