import type { Request, RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Redis } from 'ioredis';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { AppError } from '../lib/errors';

/**
 * Rate limits are counted in Redis, so the limit is shared by every API
 * instance. If Redis is unreachable the limiter fails open (requests are
 * allowed and the error is logged) rather than taking authentication down.
 */
function limiter(
  redis: Redis,
  opts: { name: string; max: number; windowSec: number; key?: (req: Request) => string; skipSuccessful?: boolean },
): RequestHandler {
  return rateLimit({
    windowMs: opts.windowSec * 1000,
    limit: opts.max,
    // For login only failed attempts count, so normal users are never locked out by logging in.
    skipSuccessfulRequests: opts.skipSuccessful ?? false,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    passOnStoreError: true,
    ...(opts.key ? { keyGenerator: opts.key } : {}),
    store: new RedisStore({
      prefix: `fd:rl:${opts.name}:`,
      sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<RedisReply>,
    }),
    handler: (_req, _res, next, options) => {
      next(new AppError(429, 'RATE_LIMITED', 'Too many requests; please try again later', {
        retryAfterSeconds: Math.ceil(options.windowMs / 1000),
      }));
    },
  });
}

/** Per client IP. Protects against password guessing. */
export const loginLimiter = (redis: Redis, max: number, windowSec: number) =>
  limiter(redis, { name: 'login', max, windowSec, skipSuccessful: true });

/** Per authenticated user (runs after authentication). */
export const eventLimiter = (redis: Redis, max: number, windowSec: number) =>
  limiter(redis, { name: 'events', max, windowSec, key: (req) => req.auth?.userId ?? 'anonymous' });
