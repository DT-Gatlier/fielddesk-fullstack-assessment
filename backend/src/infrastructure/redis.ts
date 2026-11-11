import { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';
import { config } from './config.js';
import { logger } from './logger.js';

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisInstance) {
    if (config.NODE_ENV === 'test') {
      logger.info('Using in-memory RedisMock instance for tests');
      redisInstance = new (RedisMock as any)() as unknown as Redis;
    } else {
      redisInstance = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 1,
        retryStrategy(times: number) {
          if (times > 3) {
            logger.warn('Redis unreachable, using in-memory mock fallback');
            return null;
          }
          return Math.min(times * 100, 1000);
        },
        lazyConnect: true,
      });

      redisInstance.on('error', (err: Error) => {
        logger.error({ err: err.message }, 'Redis error');
      });
    }
  }
  return redisInstance;
}

let bullRedisInstance: Redis | null = null;

export function getBullRedisConnection(): Redis {
  if (!bullRedisInstance) {
    if (config.NODE_ENV === 'test') {
      bullRedisInstance = new (RedisMock as any)() as unknown as Redis;
    } else {
      bullRedisInstance = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        retryStrategy(times: number) {
          if (times > 5) {
            logger.warn('BullMQ Redis reconnection retries exceeded');
            return null;
          }
          return Math.min(times * 200, 2000);
        },
      });
      bullRedisInstance.on('error', (err: Error) => {
        logger.error({ err: err.message }, 'BullMQ Redis connection error');
      });
    }
  }
  return bullRedisInstance;
}

/**
 * Check if a token's jti is in the revocation blocklist
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  const key = `auth:blocklist:${jti}`;
  try {
    const client = getRedisClient();
    const result = await client.exists(key);
    return result === 1;
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error checking revocation blocklist');
    return false;
  }
}

/**
 * Revoke an access token by adding its jti to Redis with the remaining TTL
 */
export async function revokeToken(jti: string, ttlSeconds: number): Promise<void> {
  if (ttlSeconds <= 0) return;
  const key = `auth:blocklist:${jti}`;
  try {
    const client = getRedisClient();
    await client.set(key, 'revoked', 'EX', Math.ceil(ttlSeconds));
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error revoking token in Redis');
  }
}

/**
 * Rate limiter for failed auth attempts (max 5 failed attempts per 5 minutes per IP)
 */
export async function checkAuthRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = `ratelimit:auth:${ip}`;
  const maxAttempts = config.AUTH_RATE_LIMIT_MAX; // 5
  try {
    const client = getRedisClient();
    const countStr = await client.get(key);
    const count = countStr ? parseInt(countStr, 10) : 0;
    if (count >= maxAttempts) {
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: maxAttempts - count };
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error reading auth rate limit from Redis');
    return { allowed: true, remaining: maxAttempts };
  }
}

/**
 * Record a failed auth attempt in Redis
 */
export async function recordFailedAuthAttempt(ip: string): Promise<void> {
  const key = `ratelimit:auth:${ip}`;
  const windowSecs = config.AUTH_RATE_LIMIT_WINDOW_SECS; // 300s
  try {
    const client = getRedisClient();
    const multi = client.multi();
    multi.incr(key);
    multi.expire(key, windowSecs);
    await multi.exec();
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error recording failed auth attempt in Redis');
  }
}

/**
 * Clear failed auth attempts on successful login
 */
export async function clearAuthRateLimit(ip: string): Promise<void> {
  const key = `ratelimit:auth:${ip}`;
  try {
    const client = getRedisClient();
    await client.del(key);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error clearing auth rate limit in Redis');
  }
}

/**
 * Get cached dashboard metrics from Redis
 */
export async function getCachedDashboardMetrics(
  orgId: string,
  scope = 'all'
): Promise<any | null> {
  const key = `cache:${orgId}:dashboard:counts:${scope}`;
  try {
    const client = getRedisClient();
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error reading cached dashboard metrics from Redis');
    return null;
  }
}

/**
 * Set cached dashboard metrics in Redis (default 30s TTL per spec)
 */
export async function setCachedDashboardMetrics(
  orgId: string,
  metrics: any,
  scope = 'all',
  ttlSeconds = 30
): Promise<void> {
  const key = `cache:${orgId}:dashboard:counts:${scope}`;
  try {
    const client = getRedisClient();
    await client.set(key, JSON.stringify(metrics), 'EX', ttlSeconds);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error caching dashboard metrics in Redis');
  }
}

/**
 * Invalidate cached dashboard metrics for an organisation
 */
export async function invalidateDashboardCache(orgId: string): Promise<void> {
  try {
    const client = getRedisClient();
    const keys = await client.keys(`cache:${orgId}:dashboard:counts:*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error invalidating dashboard cache in Redis');
  }
}

/**
 * Try to acquire an idempotency lock in Redis fast-path
 * Returns: 'NEW' if successfully locked, 'PROCESSING' or 'COMPLETED' if duplicate
 */
export async function tryAcquireIdempotencyKey(
  orgId: string,
  eventId: string,
  ttlSeconds = 86400
): Promise<'NEW' | 'PROCESSING' | 'COMPLETED'> {
  const key = `idemp:${orgId}:${eventId}`;
  try {
    const client = getRedisClient();
    const existing = await client.get(key);
    if (existing) {
      return existing === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING';
    }

    const acquired = await client.set(key, 'PROCESSING', 'EX', ttlSeconds, 'NX');
    return acquired === 'OK' ? 'NEW' : 'PROCESSING';
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error checking idempotency key in Redis');
    return 'NEW'; // Fall back to DB deduplication
  }
}

/**
 * Mark idempotency key as completed with 24-hour TTL (86400s)
 */
export async function completeIdempotencyKey(
  orgId: string,
  eventId: string,
  ttlSeconds = 86400
): Promise<void> {
  const key = `idemp:${orgId}:${eventId}`;
  try {
    const client = getRedisClient();
    await client.set(key, 'COMPLETED', 'EX', ttlSeconds);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error completing idempotency key in Redis');
  }
}

/**
 * Clear an idempotency key (e.g. on rollback)
 */
export async function clearIdempotencyKey(
  orgId: string,
  eventId: string
): Promise<void> {
  const key = `idemp:${orgId}:${eventId}`;
  try {
    const client = getRedisClient();
    await client.del(key);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error clearing idempotency key in Redis');
  }
}
