import { Redis } from 'ioredis';
import { config } from './config';
import { logger } from './logger';

/**
 * Creates a Redis connection. BullMQ requires `maxRetriesPerRequest: null`
 * for blocking connections, so it is set for every client for consistency.
 */
export function createRedis(name: string): Redis {
  const client = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    connectionName: name,
    lazyConnect: false,
  });
  client.on('error', (err) => logger.warn({ err: err.message, client: name }, 'redis connection error'));
  return client;
}
