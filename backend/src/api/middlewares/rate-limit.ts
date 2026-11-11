import { Request, Response, NextFunction } from 'express';
import { config } from '../../infrastructure/config.js';
import { consumeSlidingWindowRateLimit } from '../../infrastructure/redis.js';
import { RateLimitError } from '../../domain/errors/index.js';

/**
 * Redis sliding window rate limiter for technician progress event submissions.
 * Limit: 60 requests per 1 minute per authenticated user/technician.
 */
export async function progressEventRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const actorKey = req.tenantContext?.userId || req.ip || 'anonymous';
  const key = `ratelimit:events:${actorKey}`;
  const limit = config.EVENT_RATE_LIMIT_MAX;
  const windowSeconds = config.EVENT_RATE_LIMIT_WINDOW_SECS;

  const result = await consumeSlidingWindowRateLimit(key, limit, windowSeconds);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));

  if (!result.allowed) {
    next(
      new RateLimitError(
        `Progress event rate limit exceeded (${limit} requests per ${windowSeconds}s). Please try again later.`,
        result.retryAfterSeconds
      )
    );
    return;
  }

  next();
}

