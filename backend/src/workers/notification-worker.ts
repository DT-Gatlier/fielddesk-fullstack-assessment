import { UnrecoverableError, Worker } from "bullmq";
import { Redis } from "ioredis";
import type pino from "pino";
import type { Env } from "../config.js";
import {
  NOTIFY_TECHNICIAN_JOB,
  NOTIFICATIONS_QUEUE_NAME,
} from "../queues/notifications.queue.js";
import {
  PermanentNotificationError,
  TransientNotificationError,
} from "../lib/notification-provider.js";
import { processNotificationJob } from "../services/notifications.service.js";
import type { NotificationJobPayload } from "../types/notification.js";
import type pg from "pg";

export function startNotificationWorker(
  pool: pg.Pool,
  config: Env,
  log: pino.Logger,
): Worker<NotificationJobPayload> {
  const connection = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker<NotificationJobPayload>(
    NOTIFICATIONS_QUEUE_NAME,
    async (job) => {
      const attemptNumber = job.attemptsMade + 1;
      log.info(
        {
          jobId: job.id,
          workOrderId: job.data.workOrderId,
          assignmentVersion: job.data.assignmentVersion,
          attempt: attemptNumber,
          correlationId: job.data.correlationId,
        },
        "Processing technician notification job",
      );

      try {
        const result = await processNotificationJob(
          pool,
          job.data,
          attemptNumber,
          config.NOTIFICATION_MOCK_MODE,
        );
        log.info(
          {
            jobId: job.id,
            workOrderId: job.data.workOrderId,
            result,
            correlationId: job.data.correlationId,
          },
          "Notification job completed",
        );
      } catch (error) {
        if (error instanceof PermanentNotificationError) {
          log.warn(
            {
              jobId: job.id,
              workOrderId: job.data.workOrderId,
              correlationId: job.data.correlationId,
              err: error,
            },
            "Notification permanently failed",
          );
          throw new UnrecoverableError(error.message);
        }

        if (error instanceof TransientNotificationError) {
          log.warn(
            {
              jobId: job.id,
              workOrderId: job.data.workOrderId,
              attempt: attemptNumber,
              correlationId: job.data.correlationId,
              err: error,
            },
            "Notification transient failure — will retry",
          );
          throw error;
        }

        throw error;
      }
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on("failed", (job, error) => {
    log.error(
      {
        jobId: job?.id,
        workOrderId: job?.data.workOrderId,
        correlationId: job?.data.correlationId,
        err: error,
      },
      "Notification job failed",
    );
  });

  return worker;
}
