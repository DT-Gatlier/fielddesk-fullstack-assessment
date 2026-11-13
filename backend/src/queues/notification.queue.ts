import { Queue } from "bullmq";
import Redis from "ioredis";
import { prisma } from "../config/prisma";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

let connection: Redis | null = null;
let notificationQueue: Queue | null = null;

try {
  connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  connection.connect().catch(() => {});

  notificationQueue = new Queue("notifications", {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
} catch {
  notificationQueue = null;
}

export async function enqueueNotification(data: {
  workOrderId: string;
  technicianId: string;
  organisationId: string;
  title: string;
}) {
  const jobId = `assignment-${data.workOrderId}-${data.technicianId}`;
  try {
    if (await prisma.notificationDelivery.findUnique({ where: { jobId } })) return;
    await prisma.notificationDelivery.create({ data: { jobId, organisationId: data.organisationId, workOrderId: data.workOrderId, technicianId: data.technicianId, status: "QUEUED" } });
    if (!notificationQueue) throw new Error("Notification queue unavailable");
    await notificationQueue.add("send-technician-assignment", data, {
      jobId,
    });
    await prisma.auditLog.create({ data: { organisationId: data.organisationId, action: "notification.queued", targetType: "NotificationDelivery", targetId: jobId, after: { workOrderId: data.workOrderId, technicianId: data.technicianId } } });
  } catch (err: any) {
    if (err?.code === "P2002") return;
    await prisma.notificationDelivery.updateMany({ where: { jobId }, data: { status: "FAILED", lastError: err?.message || "Queue failed" } }).catch(() => {});
    await prisma.auditLog.create({ data: { organisationId: data.organisationId, action: "notification.failed", targetType: "NotificationDelivery", targetId: jobId, after: { workOrderId: data.workOrderId, technicianId: data.technicianId, error: err?.message || "Queue failed" } } }).catch(() => {});
  }
}

