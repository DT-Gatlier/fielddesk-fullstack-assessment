import { randomUUID } from 'node:crypto';
import { Queue, type Worker } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPool, type Pool } from '../src/db/pool.js';
import { processNotification, RetryableNotificationError } from '../src/notifications/processor.js';
import { MockProvider, type MockProviderMode } from '../src/notifications/provider.js';
import { createNotificationQueue, type NotificationJob, type NotificationQueue } from '../src/notifications/queue.js';
import { createNotificationWorker, sweepPendingNotifications } from '../src/notifications/worker.js';
import {
  apiCreateWorkOrder,
  createOrg,
  createOwnerPool,
  createTestApp,
  futureWindow,
  login,
  RecordingQueue,
  recordedJobs,
  type TestOrg,
} from './helpers.js';

let app: FastifyInstance;
let ownerPool: Pool;
let appPool: Pool;
let redis: Redis;
let org: TestOrg;
let dispatcher: string;
const log = pino({ level: 'silent' });

/** Real mock provider (real Redis state, real idempotency); only its mode is pinned per test. */
function provider(mode: MockProviderMode): MockProvider {
  const instance = new MockProvider(redis, 'success', 1);
  instance.mode = async () => mode;
  return instance;
}

async function newNotification(): Promise<{ job: NotificationJob; workOrderId: string }> {
  const workOrder = await apiCreateWorkOrder(app, dispatcher, { assignedTechnicianId: org.technician.id, ...futureWindow() });
  const { rows } = await ownerPool.query<{ id: string }>('SELECT id FROM notifications WHERE work_order_id = $1', [workOrder.id]);
  const job = recordedJobs(app).find((j) => j.notificationId === rows[0]!.id)!;
  return { job, workOrderId: workOrder.id };
}

async function state(notificationId: string) {
  const notification = await ownerPool.query('SELECT status, attempts, last_error, provider_message_id FROM notifications WHERE id = $1', [
    notificationId,
  ]);
  const attempts = await ownerPool.query(
    'SELECT attempt_number, outcome FROM notification_attempts WHERE notification_id = $1 ORDER BY attempt_number',
    [notificationId],
  );
  return { ...notification.rows[0], attemptLog: attempts.rows.map((r) => r.outcome) };
}

async function auditActions(workOrderId: string): Promise<string[]> {
  const { rows } = await ownerPool.query(
    `SELECT action FROM audit_log WHERE target_id = $1 AND action LIKE 'notification.%' ORDER BY id`,
    [workOrderId],
  );
  return rows.map((r) => r.action);
}

beforeAll(async () => {
  app = await createTestApp();
  ownerPool = createOwnerPool();
  appPool = createPool(process.env.DATABASE_URL!, 10);
  redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  org = await createOrg(ownerPool);
  dispatcher = await login(app, org.dispatcher.email);
});

afterAll(async () => {
  await app.close();
  await ownerPool.end();
  await appPool.end();
  await redis.quit();
});

describe('processor', () => {
  it('sends, records the attempt and audits the outcome', async () => {
    const { job, workOrderId } = await newNotification();
    const mock = provider('success');
    expect(await processNotification({ pool: appPool, provider: mock, redis, log }, job, { isFinal: false })).toBe('sent');

    expect(await state(job.notificationId)).toMatchObject({
      status: 'sent',
      attempts: 1,
      provider_message_id: expect.stringMatching(/^mock-/),
      attemptLog: ['success'],
    });
    expect(await auditActions(workOrderId)).toEqual(['notification.sent']);
    expect(await mock.deliveries(job.notificationId)).toBe(1);
  });

  it('delivers once when the same job is processed repeatedly and concurrently', async () => {
    const { job } = await newNotification();
    const mock = provider('success');
    const deps = { pool: appPool, provider: mock, redis, log };

    const results = await Promise.all([1, 2, 3].map(() => processNotification(deps, job, { isFinal: false })));
    results.push(await processNotification(deps, job, { isFinal: false }));

    expect(results.sort()).toEqual(['sent', 'skipped', 'skipped', 'skipped']);
    expect(await mock.deliveries(job.notificationId)).toBe(1);
    expect((await state(job.notificationId)).attemptLog).toEqual(['success']);
  });

  it('records temporary failures for retry, then fails once attempts are exhausted', async () => {
    const { job, workOrderId } = await newNotification();
    const deps = { pool: appPool, provider: provider('temporary_failure'), redis, log };

    await expect(processNotification(deps, job, { isFinal: false })).rejects.toBeInstanceOf(RetryableNotificationError);
    expect(await state(job.notificationId)).toMatchObject({ status: 'pending', attempts: 1, attemptLog: ['temporary_failure'] });
    expect(await auditActions(workOrderId)).toEqual([]);

    expect(await processNotification(deps, job, { isFinal: true })).toBe('failed');
    expect(await state(job.notificationId)).toMatchObject({
      status: 'failed',
      attempts: 2,
      attemptLog: ['temporary_failure', 'temporary_failure'],
    });
    expect(await auditActions(workOrderId)).toEqual(['notification.failed']);
  });

  it('does not retry a permanent failure', async () => {
    const { job } = await newNotification();
    const result = await processNotification({ pool: appPool, provider: provider('permanent_failure'), redis, log }, job, {
      isFinal: false,
    });
    expect(result).toBe('failed');
    expect(await state(job.notificationId)).toMatchObject({ status: 'failed', attempts: 1, attemptLog: ['permanent_failure'] });
  });

  it('does not notify a technician who was unassigned before delivery', async () => {
    const { job, workOrderId } = await newNotification();
    await app.inject({
      method: 'PATCH',
      url: `/api/work-orders/${workOrderId}`,
      headers: { cookie: dispatcher },
      payload: { version: 1, assignedTechnicianId: null },
    });
    const mock = provider('success');
    expect(await processNotification({ pool: appPool, provider: mock, redis, log }, job, { isFinal: false })).toBe('failed');
    expect(await mock.deliveries(job.notificationId)).toBe(0);
    expect((await state(job.notificationId)).last_error).toContain('superseded');
  });
});

describe('BullMQ worker', () => {
  let worker: Worker | undefined;
  let queue: NotificationQueue | undefined;
  let connection: Redis | undefined;

  afterEach(async () => {
    await worker?.close();
    await queue?.close();
    await connection?.quit();
    worker = queue = connection = undefined;
  });

  async function start(mode: MockProviderMode, maxAttempts: number) {
    const queueName = `test-notifications-${randomUUID()}`;
    connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
    queue = createNotificationQueue(connection, { maxAttempts, backoffMs: 20, queueName });
    worker = createNotificationWorker({ pool: appPool, provider: provider(mode), redis, log }, { connection: connection.duplicate(), queueName });
    return { queueName };
  }

  const settled = async (notificationId: string) => {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const current = await state(notificationId);
      if (current.status !== 'pending') return current;
      if (Date.now() > deadline) throw new Error(`notification still pending: ${JSON.stringify(current)}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  it('retries temporary failures with backoff until delivery succeeds', async () => {
    await start('fail_twice', 5);
    const { job } = await newNotification();
    await queue!.enqueue(job);
    // Enqueueing the same notification again is ignored while the job exists.
    await queue!.enqueue(job);

    expect(await settled(job.notificationId)).toMatchObject({
      status: 'sent',
      attempts: 3,
      attemptLog: ['temporary_failure', 'temporary_failure', 'success'],
    });
  });

  it('marks the notification failed after the final attempt', async () => {
    await start('temporary_failure', 3);
    const { job } = await newNotification();
    await queue!.enqueue(job);
    expect(await settled(job.notificationId)).toMatchObject({
      status: 'failed',
      attempts: 3,
      attemptLog: ['temporary_failure', 'temporary_failure', 'temporary_failure'],
    });
  });

  it('fails an invalid job once instead of retrying it', async () => {
    const { queueName } = await start('success', 5);
    const raw = new Queue(queueName, { connection: connection!.duplicate() });
    try {
      const job = await raw.add('assignment', { notificationId: 'not-a-uuid' }, { attempts: 5, backoff: { type: 'fixed', delay: 10 } });
      const deadline = Date.now() + 5000;
      while ((await job.getState()) !== 'failed') {
        if (Date.now() > deadline) throw new Error('job did not fail');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const failed = await raw.getJob(job.id!);
      expect(failed!.attemptsMade).toBe(1);
      expect(failed!.failedReason).toBe('invalid job payload');
    } finally {
      await raw.close();
    }
  });
});

describe('recovery sweep', () => {
  it('re-enqueues notifications that were committed but never queued', async () => {
    const { job } = await newNotification();
    // Backdate the row as if it had been sitting unqueued. The updated_at trigger would overwrite
    // the value, so triggers are bypassed for this one transaction only.
    const client = await ownerPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      await client.query(`UPDATE notifications SET updated_at = now() - interval '10 minutes' WHERE id = $1`, [job.notificationId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const recent = await newNotification();

    const queue = new RecordingQueue();
    await sweepPendingNotifications({ pool: appPool, log }, queue, '2 minutes');
    const ids = queue.jobs.map((j) => j.notificationId);
    expect(ids).toContain(job.notificationId);
    expect(ids).not.toContain(recent.job.notificationId);
    expect(queue.jobs.find((j) => j.notificationId === job.notificationId)!.orgId).toBe(org.id);
  });
});
