import "dotenv/config";
import { Worker, Job, UnrecoverableError } from "bullmq";
import { Redis } from "ioredis";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import { sendMockNotification } from "./provider.js";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});
const database = new Pool({ connectionString: process.env.DATABASE_URL });

async function recordOutcome(job: Job, status: string, attempts: number, error?: string, result?: unknown) {
  const client = await database.connect();
  const data = job.data as { organisationId: string; workOrderId: string; technicianId: string };
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE "NotificationDelivery" SET "status"=$1, "attempts"=$2, "lastError"=$3, "result"=$4::jsonb, "completedAt"=$5, "updatedAt"=NOW() WHERE "jobId"=$6`,
      [status, attempts, error || null, result ? JSON.stringify(result) : null, status === "DELIVERED" || status === "FAILED" ? new Date() : null, String(job.id)],
    );
    await client.query(
      `INSERT INTO "AuditLog" ("id", "organisationId", "actorId", "action", "targetType", "targetId", "before", "after", "createdAt") VALUES ($1,$2,NULL,$3,'NotificationDelivery',$4,NULL,$5::jsonb,NOW())`,
      [randomUUID(), data.organisationId, `notification.${status.toLowerCase()}`, String(job.id), JSON.stringify({ workOrderId: data.workOrderId, technicianId: data.technicianId, attempts, error: error || null })],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function processNotificationJob(job: Job) {
  const { workOrderId, technicianId, organisationId, title } = job.data;
  await recordOutcome(job, "PROCESSING", job.attemptsMade + 1);

  try {
    const mode = process.env.MOCK_PROVIDER_MODE || "success";
    const result = await sendMockNotification(mode, technicianId, workOrderId);
    await recordOutcome(job, "DELIVERED", job.attemptsMade + 1, undefined, result);
    return result;
  } catch (error) {
    const attempts = job.attemptsMade + 1;
    const isPermanent = error instanceof UnrecoverableError;
    const isFinal = isPermanent || attempts >= Number(job.opts.attempts || 1);
    await recordOutcome(job, isFinal ? "FAILED" : "RETRYING", attempts, error instanceof Error ? error.message : "Unknown provider error");
    throw error;
  }
}

const worker = new Worker("notifications", processNotificationJob, {
  connection,
  concurrency: 5,
});

// worker.on("ready", () => {
//   console.log("FieldDesk Background Worker is listening for jobs on queue [notifications]");
// });

// worker.on("completed", (job: Job, result: any) => {
//   console.log(`[Worker] Job ${job.id} completed. Delivery status: ${result.status}`);
// });

// worker.on("failed", (job: Job | undefined, err: Error) => {
//   console.error(`[Worker] Job ${job?.id} failed with error: ${err.message}. Retries remaining: ${(job?.opts?.attempts || 1) - (job?.attemptsMade || 0)}`);
// });

const handleShutdown = async () => {
  await worker.close();
  await connection.quit();
  await database.end();
  process.exit(0);
};

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);
