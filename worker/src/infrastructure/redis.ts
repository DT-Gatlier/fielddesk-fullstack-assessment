import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

let bullRedisClient: Redis | null = null;

export function getBullRedisConnection(): Redis {
  if (!bullRedisClient) {
    bullRedisClient = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      },
    });

    bullRedisClient.on('error', (err) => {
      logger.error({ err: err.message }, 'BullMQ Redis connection error');
    });
  }
  return bullRedisClient;
}

export async function closeRedisConnections(): Promise<void> {
  if (bullRedisClient) {
    await bullRedisClient.quit().catch(() => {});
    bullRedisClient = null;
  }
}

