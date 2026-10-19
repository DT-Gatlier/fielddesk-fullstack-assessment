import { UnrecoverableError, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { processNotification, type ProcessorDeps } from './processor.js';
import { NOTIFICATION_QUEUE, type NotificationJob, type NotificationQueue } from './queue.js';

const jobSchema = z.object({ notificationId: z.string().uuid(), orgId: z.string().uuid() }).strict();

export function createNotificationWorker(
  deps: ProcessorDeps,
  options: { connection: Redis; concurrency?: number; queueName?: string },
): Worker<NotificationJob> {
  const worker = new Worker<NotificationJob>(
    options.queueName ?? NOTIFICATION_QUEUE,
    async (job) => {
      const parsed = jobSchema.safeParse(job.data);
      if (!parsed.success) {
        // A malformed job will never succeed: fail it once instead of burning retries.
        deps.log.error({ jobId: job.id, issues: parsed.error.issues }, 'invalid notification job; not retrying');
        throw new UnrecoverableError('invalid job payload');
      }
      // attemptsMade counts previous failed attempts, so this run is attempt attemptsMade + 1.
      const isFinal = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      return processNotification(deps, parsed.data, { isFinal });
    },
    { connection: options.connection, concurrency: options.concurrency ?? 5 },
  );

  worker.on('failed', (job, error) => {
    deps.log.warn(
      { jobId: job?.id, attemptsMade: job?.attemptsMade, maxAttempts: job?.opts.attempts, err: error },
      'notification job attempt failed',
    );
  });
  worker.on('error', (error) => deps.log.error({ err: error }, 'worker error'));
  return worker;
}

/**
 * Re-enqueues notifications that are still pending but have not been touched recently: the API
 * committed them but failed to enqueue (Redis outage, crash between commit and enqueue). The job id
 * equals the notification id, so this never duplicates a job that is still queued or retrying.
 */
export async function sweepPendingNotifications(
  deps: Pick<ProcessorDeps, 'pool' | 'log'>,
  queue: NotificationQueue,
  staleAfter = '2 minutes',
): Promise<number> {
  const { rows } = await deps.pool.query<{ id: string; org_id: string }>(
    'SELECT id, org_id FROM notifications_due_for_dispatch($1::interval, 100)',
    [staleAfter],
  );
  for (const row of rows) {
    await queue.enqueue({ notificationId: row.id, orgId: row.org_id });
  }
  if (rows.length) deps.log.info({ count: rows.length }, 'recovery sweep re-enqueued pending notifications');
  return rows.length;
}
