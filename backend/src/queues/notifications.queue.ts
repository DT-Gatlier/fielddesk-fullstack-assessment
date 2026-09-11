import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { Env } from "../config.js";
import type { NotificationJobPayload } from "../types/notification.js";

export const NOTIFICATIONS_QUEUE_NAME = "notifications";
export const NOTIFY_TECHNICIAN_JOB = "notify-technician";

let queue: Queue<NotificationJobPayload> | null = null;
let queueConnection: Redis | null = null;

export function buildNotificationJobId(
  workOrderId: string,
  assignmentVersion: number,
): string {
  return `notify:${workOrderId}:${assignmentVersion}`;
}

function getQueueConnection(config: Env): Redis {
  if (!queueConnection) {
    queueConnection = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return queueConnection;
}

export function getNotificationQueue(config: Env): Queue<NotificationJobPayload> {
  if (!queue) {
    queue = new Queue<NotificationJobPayload>(NOTIFICATIONS_QUEUE_NAME, {
      connection: getQueueConnection(config),
    });
  }
  return queue;
}

export async function enqueueTechnicianNotification(
  config: Env,
  payload: NotificationJobPayload,
): Promise<void> {
  const notificationQueue = getNotificationQueue(config);
  await notificationQueue.add(NOTIFY_TECHNICIAN_JOB, payload, {
    jobId: buildNotificationJobId(payload.workOrderId, payload.assignmentVersion),
    attempts: 4,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function closeNotificationQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (queueConnection) {
    await queueConnection.quit();
    queueConnection = null;
  }
}
