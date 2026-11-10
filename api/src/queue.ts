import 'dotenv/config';
import { Queue } from 'bullmq';
import { URL } from 'node:url';

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

const notificationQueue = new Queue('assignment-notifications', { connection });

export async function enqueueNotification(notificationId: string): Promise<void> {
  await notificationQueue.add(
    'notify-technician',
    { notificationId },
    {
      jobId: notificationId,
      attempts: 4,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  );
}

export async function closeQueue(): Promise<void> {
  await notificationQueue.close();
}
