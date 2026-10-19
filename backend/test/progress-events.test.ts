import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from '../src/db/pool.js';
import { apiCreateWorkOrder, createOrg, createOwnerPool, createTestApp, futureWindow, login, type TestOrg } from './helpers.js';

let app: FastifyInstance;
let ownerPool: Pool;
let org: TestOrg;
let other: TestOrg;
let dispatcher: string;
let technician: string;

beforeAll(async () => {
  app = await createTestApp();
  ownerPool = createOwnerPool();
  org = await createOrg(ownerPool);
  other = await createOrg(ownerPool);
  dispatcher = await login(app, org.dispatcher.email);
  technician = await login(app, org.technician.email);
});

afterAll(async () => {
  await app.close();
  await ownerPool.end();
});

const assignedWorkOrder = () => apiCreateWorkOrder(app, dispatcher, { assignedTechnicianId: org.technician.id, ...futureWindow() });

function statusEvent(workOrderId: string, status = 'in_progress', overrides: Record<string, unknown> = {}) {
  return {
    eventId: `evt-${randomUUID()}`,
    workOrderId,
    type: 'status_changed',
    occurredAt: new Date().toISOString(),
    payload: { status, note: 'Work started' },
    ...overrides,
  };
}

const submit = (payload: unknown, cookie = technician) =>
  app.inject({ method: 'POST', url: '/api/progress-events', headers: { cookie }, payload: payload as Record<string, unknown> });

async function eventCount(eventId: string): Promise<number> {
  const { rows } = await ownerPool.query('SELECT count(*)::int AS count FROM progress_events WHERE event_id = $1', [eventId]);
  return rows[0].count;
}

describe('accepted events', () => {
  it('applies a status change, stores the event and audits it', async () => {
    const workOrder = await assignedWorkOrder();
    const event = statusEvent(workOrder.id);

    const response = await submit(event);
    expect(response.statusCode).toBe(201);
    expect(response.headers['idempotent-replayed']).toBe('false');
    expect(response.json().data).toMatchObject({ eventId: event.eventId, outcome: 'applied', workOrder: { status: 'in_progress', version: 2 } });

    const stored = await ownerPool.query('SELECT type, payload, outcome, submitted_by FROM progress_events WHERE event_id = $1', [
      event.eventId,
    ]);
    expect(stored.rows[0]).toMatchObject({
      type: 'status_changed',
      payload: { status: 'in_progress', note: 'Work started' },
      outcome: 'applied',
      submitted_by: org.technician.id,
    });

    const audit = await ownerPool.query(
      `SELECT before, after, metadata FROM audit_log WHERE target_id = $1 AND action = 'work_order.status_changed'`,
      [workOrder.id],
    );
    expect(audit.rows[0]).toMatchObject({ before: { status: 'scheduled' }, after: { status: 'in_progress' }, metadata: { eventId: event.eventId } });
  });

  it('records but does not apply a status event older than the last applied one', async () => {
    const workOrder = await assignedWorkOrder();
    await submit(statusEvent(workOrder.id, 'in_progress'));
    const late = await submit(statusEvent(workOrder.id, 'on_hold', { occurredAt: new Date(Date.now() - 3_600_000).toISOString() }));
    expect(late.statusCode).toBe(201);
    expect(late.json().data).toMatchObject({ outcome: 'stale', workOrder: { status: 'in_progress' } });
  });
});

describe('idempotency', () => {
  it('returns the original outcome for a repeated eventId without applying it again', async () => {
    const workOrder = await assignedWorkOrder();
    const event = statusEvent(workOrder.id);
    expect((await submit(event)).statusCode).toBe(201);

    const repeat = await submit(event);
    expect(repeat.statusCode).toBe(200);
    expect(repeat.headers['idempotent-replayed']).toBe('true');
    expect(repeat.json().data).toMatchObject({ outcome: 'duplicate', workOrder: { status: 'in_progress', version: 2 } });
    expect(await eventCount(event.eventId)).toBe(1);
  });

  it('processes simultaneous duplicate submissions exactly once', async () => {
    const workOrder = await assignedWorkOrder();
    const event = statusEvent(workOrder.id);

    const responses = await Promise.all(Array.from({ length: 10 }, () => submit(event)));
    const statuses = responses.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 201]);

    expect(await eventCount(event.eventId)).toBe(1);
    const audit = await ownerPool.query(
      `SELECT count(*)::int AS count FROM audit_log WHERE target_id = $1 AND action = 'work_order.status_changed'`,
      [workOrder.id],
    );
    expect(audit.rows[0].count).toBe(1);
    const stored = await ownerPool.query('SELECT version FROM work_orders WHERE id = $1', [workOrder.id]);
    expect(stored.rows[0].version).toBe(2);
  });

  it('rejects reuse of an eventId for a different event', async () => {
    const workOrder = await assignedWorkOrder();
    const event = statusEvent(workOrder.id, 'in_progress');
    await submit(event);
    const reused = await submit({ ...event, payload: { status: 'on_hold' } });
    expect(reused.statusCode).toBe(409);
    expect(reused.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('validation and authorisation', () => {
  it.each([
    ['unknown type', { type: 'teleported' }],
    ['bad timestamp', { occurredAt: 'yesterday' }],
    ['timestamp in the future', { occurredAt: new Date(Date.now() + 86_400_000).toISOString() }],
    ['unknown payload field', { payload: { status: 'in_progress', injected: true } }],
    ['status not allowed for technicians', { payload: { status: 'cancelled' } }],
    ['extra top-level field', { orgId: 'whatever' }],
    ['malformed eventId', { eventId: 'has spaces and ; semicolons' }],
  ])('rejects %s with 400', async (_name, overrides) => {
    const workOrder = await assignedWorkOrder();
    const response = await submit(statusEvent(workOrder.id, 'in_progress', overrides));
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 404 for a work order not assigned to the technician', async () => {
    const unassigned = await apiCreateWorkOrder(app, dispatcher);
    const event = statusEvent(unassigned.id);
    expect((await submit(event)).statusCode).toBe(404);
    expect(await eventCount(event.eventId)).toBe(0);
  });

  it('returns 404 for a work order in another organisation', async () => {
    const otherDispatcher = await login(app, other.dispatcher.email);
    const foreign = await apiCreateWorkOrder(app, otherDispatcher, { assignedTechnicianId: other.technician.id, ...futureWindow() });
    expect((await submit(statusEvent(foreign.id))).statusCode).toBe(404);
  });

  it('only accepts events from technicians', async () => {
    const workOrder = await assignedWorkOrder();
    expect((await submit(statusEvent(workOrder.id), dispatcher)).statusCode).toBe(403);
  });

  it('rejects invalid transitions without storing the event', async () => {
    const workOrder = await assignedWorkOrder();
    await submit(statusEvent(workOrder.id, 'in_progress'));
    await submit(statusEvent(workOrder.id, 'completed'));
    const event = statusEvent(workOrder.id, 'in_progress');
    const response = await submit(event);
    expect(response.statusCode).toBe(422);
    expect(await eventCount(event.eventId)).toBe(0);
  });
});

describe('transaction rollback', () => {
  it('leaves no partial changes when processing fails midway', async () => {
    const workOrder = await assignedWorkOrder();
    const event = statusEvent(workOrder.id);

    // Make the audit insert (the last write in the transaction) fail for this work order only.
    const fn = `fail_audit_${randomUUID().replace(/-/g, '')}`;
    await ownerPool.query(`
      CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.target_id = '${workOrder.id}' AND NEW.action = 'work_order.status_changed' THEN
          RAISE EXCEPTION 'simulated failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER ${fn} BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION ${fn}();`);

    try {
      const response = await submit(event);
      expect(response.statusCode).toBe(500);
      expect(response.json().error).toMatchObject({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });

      // The event record and the status change were rolled back with the failed audit write.
      expect(await eventCount(event.eventId)).toBe(0);
      const stored = await ownerPool.query('SELECT status, version FROM work_orders WHERE id = $1', [workOrder.id]);
      expect(stored.rows[0]).toEqual({ status: 'scheduled', version: 1 });
    } finally {
      await ownerPool.query(`DROP TRIGGER ${fn} ON audit_log; DROP FUNCTION ${fn}();`);
    }

    // Because nothing was stored, the client's retry of the same eventId now succeeds.
    const retry = await submit(event);
    expect(retry.statusCode).toBe(201);
    expect(retry.json().data.workOrder.status).toBe('in_progress');
  });
});
