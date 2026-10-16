import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SeedResult } from '../backend/src/db/seed-data';
import { createTestApp, createWorkOrder, loginAs, pool, resetData, window, type Agent, type TestContext } from './helpers';

/**
 * Two independent API instances (separate Express apps, Redis clients and
 * database connections) share only PostgreSQL — exactly like two replicas
 * behind a load balancer. If correctness depended on in-process state, these
 * tests would fail.
 */
let instanceA: TestContext;
let instanceB: TestContext;
let seed: SeedResult;
let dispatcherA: Agent;
let dispatcherB: Agent;

beforeAll(async () => {
  instanceA = await createTestApp();
  instanceB = await createTestApp();
});
beforeEach(async () => {
  seed = await resetData(instanceA.redis);
  dispatcherA = await loginAs(instanceA.app, 'dispatcher@acme.test');
  dispatcherB = await loginAs(instanceB.app, 'owner@acme.test'); // a second person with dispatcher rights
});
afterAll(async () => {
  await instanceA.close();
  await instanceB.close();
});

async function overlappingPairs(technicianId: string) {
  const { rows } = await pool.query(
    `SELECT a.reference, b.reference FROM work_orders a JOIN work_orders b
       ON a.technician_id = b.technician_id AND a.id < b.id
      AND tstzrange(a.scheduled_start, a.scheduled_end, '[)') && tstzrange(b.scheduled_start, b.scheduled_end, '[)')
      AND a.status NOT IN ('completed','cancelled') AND b.status NOT IN ('completed','cancelled')
    WHERE a.technician_id = $1`,
    [technicianId],
  );
  return rows;
}

describe('scheduling conflicts', () => {
  it('rejects an overlapping assignment with a meaningful 409', async () => {
    const tech = seed.acme!.users.tech2!.id;
    const first = await createWorkOrder(dispatcherA, { technicianId: tech, ...window(10, 12) });
    const second = await createWorkOrder(dispatcherA);
    const res = await dispatcherA.put(`/api/work-orders/${second.id}/assignment`).send({ technicianId: tech, ...window(11, 13) });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'SCHEDULE_CONFLICT',
      details: { conflictingWorkOrder: { id: first.id, reference: first.reference } },
    });
  });

  it('allows back-to-back windows (end is exclusive) and the same window for different technicians', async () => {
    const t1 = seed.acme!.users.tech2!.id;
    await createWorkOrder(dispatcherA, { technicianId: t1, ...window(10, 12) });
    await expect(createWorkOrder(dispatcherA, { technicianId: t1, ...window(12, 14) })).resolves.toBeTruthy();
    await expect(createWorkOrder(dispatcherA, { technicianId: seed.acme!.users.techFlaky!.id, ...window(10, 12) })).resolves.toBeTruthy();
  });

  it('completed and cancelled work no longer blocks the technician’s time', async () => {
    const tech = seed.acme!.users.tech2!.id;
    const first = await createWorkOrder(dispatcherA, { technicianId: tech, ...window(20, 22) });
    await dispatcherA.post(`/api/work-orders/${first.id}/status`).send({ status: 'cancelled' });
    await expect(createWorkOrder(dispatcherA, { technicianId: tech, ...window(20, 22) })).resolves.toBeTruthy();
  });

  it('rescheduling a work order does not conflict with itself', async () => {
    const tech = seed.acme!.users.tech2!.id;
    const wo = await createWorkOrder(dispatcherA, { technicianId: tech, ...window(30, 32) });
    const res = await dispatcherA.put(`/api/work-orders/${wo.id}/assignment`).send({ technicianId: tech, ...window(31, 33) });
    expect(res.status).toBe(200);
  });
});

describe('concurrent conflicting assignments (two API instances)', () => {
  it('exactly one of two simultaneous conflicting assignments succeeds — repeated 10 times', async () => {
    const tech = seed.acme!.users.tech2!.id;
    for (let round = 0; round < 10; round++) {
      const a = await createWorkOrder(dispatcherA, { title: `A${round}` });
      const b = await createWorkOrder(dispatcherA, { title: `B${round}` });
      const slot = window(100 + round * 10, 102 + round * 10);
      const shifted = window(101 + round * 10, 103 + round * 10);

      const [ra, rb] = await Promise.all([
        dispatcherA.put(`/api/work-orders/${a.id}/assignment`).send({ technicianId: tech, ...slot }),
        dispatcherB.put(`/api/work-orders/${b.id}/assignment`).send({ technicianId: tech, ...shifted }),
      ]);
      const statuses = [ra.status, rb.status].sort();
      expect(statuses, `round ${round}`).toEqual([200, 409]);
      const loser = ra.status === 409 ? ra : rb;
      expect(loser.body.error.code).toBe('SCHEDULE_CONFLICT');
    }
    expect(await overlappingPairs(tech)).toEqual([]);
    // Only the winners were notified (one outbox row per successful assignment).
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM notifications WHERE technician_id = $1', [tech]);
    expect(rows[0].n).toBe(10);
  });

  it('many concurrent creations for the same slot produce exactly one booking', async () => {
    const tech = seed.acme!.users.techFlaky!.id;
    const agents = [dispatcherA, dispatcherB, dispatcherA, dispatcherB, dispatcherA, dispatcherB];
    const results = await Promise.all(
      agents.map((agent, i) =>
        agent.post('/api/work-orders').send({
          title: `Race ${i}`, priority: 'high', siteName: 'Race Site', technicianId: tech, ...window(500, 504),
        }),
      ),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(5);
    expect(await overlappingPairs(tech)).toEqual([]);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM work_orders WHERE title LIKE 'Race %'");
    expect(rows[0].n).toBe(1); // losers rolled back completely, no orphan rows
  });

  it('the database constraint holds even without the application pre-check', async () => {
    const tech = seed.acme!.users.tech2!.id;
    await createWorkOrder(dispatcherA, { technicianId: tech, ...window(900, 902) });
    const w = window(901, 903);
    await expect(
      pool.query(
        `INSERT INTO work_orders (org_id, reference, title, priority, site_name, technician_id, scheduled_start, scheduled_end, created_by)
         VALUES ($1, 'WO-X', 'direct', 'low', 's', $2, $3, $4, $5)`,
        [seed.acme!.id, tech, w.scheduledStart, w.scheduledEnd, seed.acme!.users.dispatcher!.id],
      ),
    ).rejects.toMatchObject({ code: '23P01' });
  });
});
