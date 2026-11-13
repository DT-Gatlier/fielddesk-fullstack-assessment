import { ConnectionOptions, Job, UnrecoverableError, Worker } from 'bullmq';
import { config } from './infrastructure/config.js';
import { logger, runWithLogContext } from './infrastructure/logger.js';
import { getBullRedisConnection } from './infrastructure/redis.js';
import { mockNotificationProvider } from './providers/mock-notification.provider.js';
import { NotificationPayload } from './types/notification.types.js';
import { notificationTrackerService } from './services/notification-tracker.service.js';

export interface ProcessableNotificationJob {
  id?: string;
  data: NotificationPayload;
  attemptsMade?: number;
  opts?: { attempts?: number };
}

let activeWorker: Worker<NotificationPayload> | null = null;

export async function processTechnicianNotificationJob(job: ProcessableNotificationJob) {
  const attempt = (job.attemptsMade ?? 0) + 1;
  const { workOrderId, technicianId, organisationId, correlationId } = job.data;

  return runWithLogContext(
    {
      correlationId: correlationId || job.id || 'worker',
      organisationId,
      jobId: job.id,
    },
    async () => {
      logger.info(
        {
          jobId: job.id,
          workOrderId,
          technicianId,
          attempt,
          maxAttempts: job.opts?.attempts || 5,
        },
        `Processing technician assignment notification attempt #${attempt}`
      );

      try {
        const result = await mockNotificationProvider.sendAssignmentNotification(job.data);

        await notificationTrackerService.recordAudit({
          organisationId,
          workOrderId,
          technicianId,
          action: 'NOTIFICATION_DELIVERED',
          attempt,
          provider: result.provider,
          deliveredAt: result.deliveredAt,
        });

        logger.info(
          { jobId: job.id, workOrderId, attempt },
          'Technician notification delivered successfully'
        );

        return result;
      } catch (error: any) {
        const isPermanent =
          error instanceof UnrecoverableError ||
          error.name === 'UnrecoverableError' ||
          error.message?.includes('MOCK_400');

        if (isPermanent) {
          await notificationTrackerService.recordAudit({
            organisationId,
            workOrderId,
            technicianId,
            action: 'NOTIFICATION_PERMANENTLY_FAILED',
            attempt,
            error: error.message,
            fatal: true,
          });

          logger.error(
            { jobId: job.id, workOrderId, attempt, err: error.message },
            'Fatal notification delivery failure. Retries aborted immediately.'
          );

          // Re-throw so BullMQ flags unrecoverable failure
          if (!(error instanceof UnrecoverableError)) {
            throw new UnrecoverableError(error.message);
          }
          throw error;
        } else {
          // Exponential backoff calculation for diagnostics (e.g. 2s, 4s, 8s...)
          const nextRetryDelay = Math.pow(2, attempt) * 1000;

          await notificationTrackerService.recordAudit({
            organisationId,
            workOrderId,
            technicianId,
            action: 'NOTIFICATION_ATTEMPT_FAILED',
            attempt,
            error: error.message,
            nextRetryDelay,
          });

          logger.warn(
            {
              jobId: job.id,
              workOrderId,
              attempt,
              err: error.message,
              nextRetryDelayMs: nextRetryDelay,
            },
            'Transient notification failure. BullMQ will retry with exponential backoff.'
          );

          throw error;
        }
      }
    }
  );
}

export function createTechnicianNotificationWorker(connection?: ConnectionOptions): Worker<NotificationPayload> {
  const conn = connection || (getBullRedisConnection() as any);
  const worker = new Worker<NotificationPayload>(
    config.QUEUE_NAME,
    async (job: Job<NotificationPayload>) => {
      return await processTechnicianNotificationJob(job);
    },
    {
      connection: conn,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.info(
      { jobId: job.id, attempts: (job.attemptsMade || 0) + 1 },
      'Technician notification job completed'
    );
  });

  worker.on('failed', (job, err) => {
    logger.warn(
      { jobId: job?.id, attempts: (job?.attemptsMade || 0) + 1, err: err.message },
      'Technician notification job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ err: err.message }, 'Technician notification worker internal error');
  });

  return worker;
}

export function startTechnicianNotificationWorker(): Worker<NotificationPayload> | null {
  if (config.NODE_ENV === 'test') {
    return null;
  }
  if (!activeWorker) {
    try {
      activeWorker = createTechnicianNotificationWorker();
      logger.info('Technician notification BullMQ worker started');
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Could not start background worker (Redis may be offline)');
    }
  }
  return activeWorker;
}

export async function stopTechnicianNotificationWorker(): Promise<void> {
  if (activeWorker) {
    try {
      await activeWorker.close();
      logger.info('Technician notification BullMQ worker stopped');
    } catch (err: any) {
      logger.error({ err: err.message }, 'Error closing background worker');
    } finally {
      activeWorker = null;
    }
  }
}

