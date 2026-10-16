import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SeedResult } from '../backend/src/db/seed-data';
import { NOTIFICATION_QUEUE, NOTIFY_JOB } from '../shared/queue';
import { createRedis } from '../shared/redis';
import { backoffDelay } from '../worker/src/backoff';
import { MOCK_KEYS, MockProvider } from '../worker/src/mock-provider';
import { processNotification } from '../worker/src/notify';
import { relayPending } from '../worker/src/relay';
import { startWorkerRuntime, type WorkerRuntime } from '../worker/src/runtime';
import { createTestApp, createWorkOrder, loginAs, pool, resetData, waitFor, window, type Agent, type TestContext } from './helpers';

const log = pino({ level: 'silent' });
let ctx: TestContext;
let seed: SeedResult;
let dispatcher: Agent;
let providerRedis: Redis;
let provider: MockProvider;
let runtime: WorkerRuntime | undefined;

beforeAll(async () => {
  ctx = await createTestApp();
  providerRedis = createRedis('test-provider');
  provider = new MockProvider(providerRedis, { defaultMode: 'success', flakyFailures: 2, latencyMs: 0 });
});
beforeEach(async () => {
  await runtime?.stop();
  runtime = undefined;
  seed = await resetData(ctx.redis);
  dispatcher = await loginAs(ctx.app, 'dispatcher@acme.test');
});
afterAll(async () => {
  await runtime?.stop();
  await providerRedis.quit();
  await ctx.close();
});

function startWorker() {
  runtime = startWorkerRuntime({ connection: createRedis('test-bullmq'), provider, redis: providerRedis, pollMs: 25, backoffBaseMs: 20 });
  return runtime;
}
const delivered = async () => (await providerRedis.lrange(MOCK_KEYS.sent, 0, -1)).map((m) => JSON.parse(m));
const notification = async (workOrderId: string) =>
  (await pool.query('SELECT * FROM notifications WHERE work_order_id = $1', [workOrderId])).rows[0];
const attempts = async (notificationId: string) =>
  (await pool.query('SELECT attempt_no, outcome FROM notification_attempts WHERE notification_id = $1 ORDER BY attempt_no', [notificationId])).rows;
const assignTo = (key: string, slot = window(1, 2)) =>
  createWorkOrder(dispatcher, { technicianId: seed.acme!.users[key]!.id, ...slot });

describe('assignment enqueues a notification (transactional outbox)', () => {
  it('creates exactly one outbox row per assignment, in the same transaction', async () => {
    const wo = await assignTo('tech1', window(1, 2));
    const n = await notification(wo.id);
    expect(n).toMatchObject({ status: 'pending', recipient: 'tech1@acme.test', technician_id: seed.acme!.users.tech1!.id });
    expect(n.dedupe_key).toBe(`${wo.id}:assignment:1`);

    // Rescheduling the same technician is not a new assignment; reassigning is.
    await dispatcher.put(`/api/work-orders/${wo.id}/assignment`).send({ technicianId: seed.acme!.users.tech1!.id, ...window(3, 4) });
    expect((await pool.query('SELECT count(*)::int AS n FROM notifications WHERE work_order_id = $1', [wo.id])).rows[0].n).toBe(1);
    await dispatcher.put(`/api/work-orders/${wo.id}/assignment`).send({ technicianId: seed.acme!.users.tech2!.id, ...window(3, 4) });
    expect((await pool.query('SELECT count(*)::int AS n FROM notifications WHERE work_order_id = $1', [wo.id])).rows[0].n).toBe(2);
  });

  it('a rolled-back assignment produces no notification', async () => {
    await assignTo('tech1', window(1, 3));
    const wo = await createWorkOrder(dispatcher);
    const res = await dispatcher.put(`/api/work-orders/${wo.id}/assignment`).send({ technicianId: seed.acme!.users.tech1!.id, ...window(2, 4) });
    expect(res.status).toBe(409);
    expect(await notification(wo.id)).toBeUndefined();
  });
});

describe('worker processing', () => {
  it('delivers a notification once and records the attempt and outcome', async () => {
    const wo = await assignTo('tech1');
    startWorker();
    const n = await waitFor(async () => {
      const row = await notification(wo.id);
      return row.status === 'delivered' ? row : null;
    });
    expect(n.attempts).toBe(1);
    expect(n.provider_message_id).toMatch(/^mock-/);
    expect(await attempts(n.id)).toEqual([{ attempt_no: 1, outcome: 'success' }]);
    expect(await delivered()).toHaveLength(1);
    const audit = await pool.query("SELECT actor_type, after FROM audit_log WHERE action = 'notification.delivered' AND target_id = $1", [n.id]);
    expect(audit.rows[0]).toMatchObject({ actor_type: 'system', after: { status: 'delivered', attempts: 1 } });
  });

  it('retries temporary failures with backoff, then succeeds — one delivery only', async () => {
    const wo = await assignTo('techFlaky'); // "+tempfail": fails twice, then succeeds
    startWorker();
    const n = await waitFor(async () => {
      const row = await notification(wo.id);
      return row.status === 'delivered' ? row : null;
    });
    expect(await attempts(n.id)).toEqual([
      { attempt_no: 1, outcome: 'temporary_failure' },
      { attempt_no: 2, outcome: 'temporary_failure' },
      { attempt_no: 3, outcome: 'success' },
    ]);
    expect(await delivered()).toHaveLength(1);
  });

  it('stops immediately on a permanent failure', async () => {
    const wo = await assignTo('techInvalid'); // "+permfail"
    const rt = startWorker();
    const n = await waitFor(async () => {
      const row = await notification(wo.id);
      return row.status === 'failed' ? row : null;
    });
    expect(await attempts(n.id)).toEqual([{ attempt_no: 1, outcome: 'permanent_failure' }]);
    const job = await rt.queue.getJob(n.id);
    expect(job?.attemptsMade).toBe(1); // not retried
    await new Promise((r) => setTimeout(r, 300));
    expect(await attempts(n.id)).toHaveLength(1);
    const audit = await pool.query("SELECT after FROM audit_log WHERE action = 'notification.failed' AND target_id = $1", [n.id]);
    expect(audit.rows[0].after).toMatchObject({ reason: 'permanent', status: 'failed' });
    expect(await delivered()).toHaveLength(0);
  });

  it('gives up after the maximum attempts when failures stay temporary', async () => {
    await providerRedis.set(MOCK_KEYS.mode, 'temporary_failure');
    const wo = await assignTo('tech1');
    startWorker();
    const n = await waitFor(async () => {
      const row = await notification(wo.id);
      return row.status === 'failed' ? row : null;
    });
    // NOTIFY_MAX_ATTEMPTS=4 in the test environment.
    expect((await attempts(n.id)).map((a) => a.outcome)).toEqual(Array(4).fill('temporary_failure'));
    const audit = await pool.query("SELECT after FROM audit_log WHERE action = 'notification.failed' AND target_id = $1", [n.id]);
    expect(audit.rows[0].after).toMatchObject({ reason: 'retries_exhausted', attempts: 4 });
  });

  it('fails malformed jobs permanently without retrying', async () => {
    const rt = startWorker();
    const job = await rt.queue.add(NOTIFY_JOB, { notificationId: 'not-a-uuid' } as never, { attempts: 4, jobId: 'bad-job' });
    await waitFor(async () => (await rt.queue.getJob(job.id!))?.failedReason);
    const failed = await rt.queue.getJob(job.id!);
    expect(failed?.attemptsMade).toBe(1);
    expect(failed?.failedReason).toMatch(/invalid job payload/);
  });
});

describe('duplicate delivery protection', () => {
  it('relaying the same notification twice creates one queue job', async () => {
    const wo = await assignTo('tech1');
    const queue = new Queue(NOTIFICATION_QUEUE, { connection: createRedis('test-queue') });
    expect(await relayPending(queue, log)).toBe(1);
    const n = await notification(wo.id);
    // Simulate a crash between queue.add() and the DB update: row back to pending, relay runs again.
    await pool.query("UPDATE notifications SET status = 'pending' WHERE id = $1", [n.id]);
    expect(await relayPending(queue, log)).toBe(1);
    const counts = await queue.getJobCounts('waiting', 'delayed', 'active', 'completed', 'failed');
    expect(Object.values(counts).reduce((x, y) => x + y, 0)).toBe(1);
    await queue.close();
  });

  it('two workers processing the same notification concurrently send it once', async () => {
    const wo = await assignTo('tech1');
    const n = await notification(wo.id);
    const run = () => processNotification({ notificationId: n.id, isFinalAttempt: false, provider, redis: providerRedis, log });
    const outcomes = await Promise.all([run(), run(), run()]);
    expect(outcomes.map((o) => o.kind).sort()).toEqual(['delivered', 'skipped', 'skipped']);
    expect(await delivered()).toHaveLength(1);
    expect(await attempts(n.id)).toEqual([{ attempt_no: 1, outcome: 'success' }]);
  });

  it('a retry after a crash (provider accepted, we never committed) does not send again', async () => {
    const wo = await assignTo('tech1');
    const n = await notification(wo.id);
    // The provider received the message, then the worker died before recording it.
    await provider.send({ idempotencyKey: n.dedupe_key, to: n.recipient, subject: n.subject, body: n.body }, new AbortController().signal);
    const outcome = await processNotification({ notificationId: n.id, isFinalAttempt: false, provider, redis: providerRedis, log });
    expect(outcome).toMatchObject({ kind: 'delivered', duplicate: true });
    expect(await delivered()).toHaveLength(1);
    expect(await attempts(n.id)).toEqual([{ attempt_no: 1, outcome: 'duplicate_suppressed' }]);
    expect((await notification(wo.id)).status).toBe('delivered');
  });

  it('a job re-run after final delivery is skipped', async () => {
    const wo = await assignTo('tech1');
    const n = await notification(wo.id);
    await processNotification({ notificationId: n.id, isFinalAttempt: false, provider, redis: providerRedis, log });
    const again = await processNotification({ notificationId: n.id, isFinalAttempt: false, provider, redis: providerRedis, log });
    expect(again).toEqual({ kind: 'skipped', reason: 'already delivered' });
    expect(await delivered()).toHaveLength(1);
  });
});

describe('backoff', () => {
  it('grows exponentially with jitter and is capped', () => {
    const mid = () => 0.5;
    expect([1, 2, 3, 4].map((n) => backoffDelay(n, 1000, 300_000, mid))).toEqual([750, 1500, 3000, 6000]);
    expect(backoffDelay(30, 1000, 300_000, () => 1)).toBe(300_000);
    expect(backoffDelay(1, 1000, 300_000, () => 0)).toBe(500);
  });
});
