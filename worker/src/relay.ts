import type { JobsOptions, Queue } from 'bullmq';
import type { Logger } from 'pino';
import { config } from '../../shared/config';
import { pool, withTransaction } from '../../shared/db';
import { NOTIFY_JOB, type NotifyJobData } from '../../shared/queue';

export const jobOptions = (): JobsOptions => ({
  attempts: config.NOTIFY_MAX_ATTEMPTS,
  backoff: { type: 'jitter' }, // custom strategy, see backoff.ts
  removeOnComplete: { age: 7 * 86_400, count: 10_000 },
  removeOnFail: { age: 30 * 86_400 },
});

/**
 * Outbox relay: moves committed `pending` notifications into the BullMQ queue.
 *
 * - FOR UPDATE SKIP LOCKED lets several worker processes relay in parallel
 *   without picking the same rows.
 * - jobId = notification id. BullMQ ignores an add() whose jobId already
 *   exists, so if we crash after add() but before marking the row
 *   "enqueued", the retry of this relay does not create a second job.
 */
export async function relayPending(queue: Queue<NotifyJobData>, log: Logger, limit = 100): Promise<number> {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; org_id: string }>(
      `SELECT id, org_id FROM notifications WHERE status = 'pending'
        ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    if (!rows.length) return 0;
    for (const r of rows) {
      await queue.add(NOTIFY_JOB, { notificationId: r.id }, { ...jobOptions(), jobId: r.id });
    }
    await tx.query(`UPDATE notifications SET status = 'enqueued', enqueued_at = now() WHERE id = ANY($1::uuid[])`, [rows.map((r) => r.id)]);
    log.info({ count: rows.length }, 'relayed notifications to queue');
    return rows.length;
  });
}

/**
 * Safety net for Redis data loss: a notification the database says is in
 * flight but whose job no longer exists in the queue is re-added.
 */
export async function recoverLostJobs(queue: Queue<NotifyJobData>, log: Logger, olderThanSec = 600): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM notifications WHERE status IN ('enqueued','retrying')
       AND updated_at < now() - make_interval(secs => $1) LIMIT 200`,
    [olderThanSec],
  );
  let recovered = 0;
  for (const r of rows) {
    if (!(await queue.getJob(r.id))) {
      await queue.add(NOTIFY_JOB, { notificationId: r.id }, { ...jobOptions(), jobId: r.id });
      recovered++;
    }
  }
  if (recovered) log.warn({ recovered }, 're-enqueued notifications missing from the queue');
  return recovered;
}
