import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export const NOTIFICATION_QUEUE = 'fielddesk-notifications';

export interface NotificationJob {
  notificationId: string;
  orgId: string;
}

export interface NotificationQueue {
  enqueue(job: NotificationJob): Promise<void>;
  close(): Promise<void>;
}

export function createNotificationQueue(
  connection: Redis,
  options: { maxAttempts: number; backoffMs: number; queueName?: string },
): NotificationQueue {
  const queue = new Queue<NotificationJob>(options.queueName ?? NOTIFICATION_QUEUE, { connection });
  return {
    async enqueue(job) {
      await queue.add('assignment', job, {
        // The notification id is the job id: enqueueing the same notification twice (request path and
        // recovery sweep) is a no-op while the first job still exists.
        jobId: job.notificationId,
        attempts: options.maxAttempts,
        backoff: { type: 'exponential', delay: options.backoffMs },
        removeOnComplete: { age: 24 * 3600, count: 5000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      });
    },
    close: () => queue.close(),
  };
}
