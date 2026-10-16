import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { config } from '../../shared/config';
import { pool } from '../../shared/db';
import { logger } from '../../shared/logger';
import { NOTIFICATION_QUEUE, type NotifyJobData } from '../../shared/queue';
import { backoffDelay } from './backoff';
import { processNotification } from './notify';
import type { NotificationProvider } from './provider';
import { recoverLostJobs, relayPending } from './relay';

const jobSchema = z.object({ notificationId: z.string().uuid() }).strict();

export interface WorkerRuntime {
  queue: Queue<NotifyJobData>;
  worker: Worker<NotifyJobData>;
  relayOnce(): Promise<number>;
  stop(): Promise<void>;
}

/**
 * Wires the outbox relay, the BullMQ consumer and periodic maintenance.
 * Runs as its own process (worker/src/index.ts), completely independent of
 * the API; any number of worker processes can run side by side.
 */
export function startWorkerRuntime(opts: {
  connection: Redis;
  provider: NotificationProvider;
  redis: Redis;
  pollMs?: number;
  backoffBaseMs?: number;
}): WorkerRuntime {
  const log = logger.child({ component: 'worker' });
  const queue = new Queue<NotifyJobData>(NOTIFICATION_QUEUE, { connection: opts.connection });
  const baseMs = opts.backoffBaseMs ?? config.NOTIFY_BACKOFF_BASE_MS;

  const worker = new Worker<NotifyJobData>(
    NOTIFICATION_QUEUE,
    async (job: Job<NotifyJobData>) => {
      const parsed = jobSchema.safeParse(job.data);
      // A malformed job can never succeed: fail it permanently, no retries.
      if (!parsed.success) throw new UnrecoverableError(`invalid job payload: ${parsed.error.message}`);
      const attempt = job.attemptsMade + 1;
      const maxAttempts = job.opts.attempts ?? 1;
      const jobLog = log.child({ jobId: job.id, notificationId: parsed.data.notificationId, attempt, maxAttempts });
      const outcome = await processNotification({
        notificationId: parsed.data.notificationId,
        isFinalAttempt: attempt >= maxAttempts,
        provider: opts.provider,
        redis: opts.redis,
        log: jobLog,
      });
      if (outcome.kind === 'temporary_failure') throw new Error(outcome.error); // BullMQ schedules a retry with backoff
      if (outcome.kind === 'permanent_failure') throw new UnrecoverableError(outcome.error); // no further retries
      return outcome;
    },
    {
      connection: opts.connection,
      concurrency: config.WORKER_CONCURRENCY,
      settings: { backoffStrategy: (attemptsMade: number) => backoffDelay(attemptsMade, baseMs) },
    },
  );

  worker.on('failed', (job, err) => {
    const willRetry = !!job && !(err instanceof UnrecoverableError) && job.attemptsMade < (job.opts.attempts ?? 1);
    log.warn({ jobId: job?.id, attemptsMade: job?.attemptsMade, willRetry, err: err.message }, willRetry ? 'job failed; retry scheduled' : 'job failed permanently');
  });
  worker.on('completed', (job, result) => log.debug({ jobId: job.id, result }, 'job completed'));
  worker.on('error', (err) => log.error({ err }, 'worker error'));

  let stopped = false;
  const relayOnce = () => relayPending(queue, log);

  // Outbox relay loop.
  const pollMs = opts.pollMs ?? config.OUTBOX_POLL_MS;
  const relayLoop = (async () => {
    while (!stopped) {
      try {
        const moved = await relayOnce();
        if (moved > 0) continue; // drain quickly when there is a backlog
      } catch (err) {
        log.error({ err }, 'outbox relay failed; will retry');
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  })();

  // Maintenance: lost-job recovery and expired-session cleanup.
  const maintenance = setInterval(async () => {
    try {
      await recoverLostJobs(queue, log);
      const s = await pool.query('DELETE FROM sessions WHERE expires_at < now()');
      if (s.rowCount) log.info({ deleted: s.rowCount }, 'expired sessions removed');
    } catch (err) {
      log.error({ err }, 'maintenance failed');
    }
  }, 60_000);
  maintenance.unref();

  return {
    queue,
    worker,
    relayOnce,
    async stop() {
      stopped = true;
      clearInterval(maintenance);
      await relayLoop;
      // close() waits for active jobs to finish; unfinished work stays in Redis for the next worker.
      await worker.close();
      await queue.close();
    },
  };
}
