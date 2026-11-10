import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { URL } from 'node:url';
import { NotificationStatus } from '@prisma/client';
import { prisma } from './db';
import { processNotification } from './notification';

const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
const connection = {
  host: redisUrl.hostname || 'localhost',
  port: Number(redisUrl.port || 6379),
  ...(redisUrl.username ? { username: decodeURIComponent(redisUrl.username) } : {}),
  ...(redisUrl.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
  ...(redisUrl.pathname.length > 1 ? { db: Number(redisUrl.pathname.slice(1)) } : {}),
  ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
  maxRetriesPerRequest: null,
};

const queue = new Queue('assignment-notifications', { connection });
const worker = new Worker(
  'assignment-notifications',
  async (job) => processNotification(job.data.notificationId),
  { connection, concurrency: 5 },
);

worker.on('completed', (job) => {
  console.log(JSON.stringify({
    level: 'info',
    message: 'notification_job_completed',
    jobId: job.id,
  }));
});

worker.on('failed', async (job, error) => {
  console.error(JSON.stringify({
    level: 'error',
    message: 'notification_job_failed',
    jobId: job?.id,
    attempt: job?.attemptsMade,
    error: error.message,
  }));
});

async function enqueuePending() {
  const pending = await prisma.notification.findMany({
    where: { status: NotificationStatus.PENDING },
    select: { id: true },
    take: 100,
    orderBy: { createdAt: 'asc' },
  });
  for (const notification of pending) {
    await queue.add(
      'notify-technician',
      { notificationId: notification.id },
      {
        jobId: notification.id,
        attempts: 4,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
  }
}

worker.on('error', (error) => console.error(JSON.stringify({ level: 'error', message: 'worker_error', error: error.message })));
queue.on('error', (error) => console.error(JSON.stringify({ level: 'error', message: 'queue_error', error: error.message })));

worker.on('ready', () => {
  void enqueuePending().catch((error) => {
    console.error(JSON.stringify({
      level: 'error',
      message: 'notification_outbox_scan_failed',
      error: error instanceof Error ? error.message : 'unknown error',
    }));
  });
});
const outboxInterval = setInterval(() => {
  void enqueuePending().catch((error) => {
    console.error(JSON.stringify({
      level: 'error',
      message: 'notification_outbox_scan_failed',
      error: error instanceof Error ? error.message : 'unknown error',
    }));
  });
}, 15_000);

const shutdown = async () => {
  clearInterval(outboxInterval);
  await worker.close();
  await queue.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
