import { Router, Request, Response } from 'express';
import { getDbPool } from '../../infrastructure/db.js';
import { getRedisClient } from '../../infrastructure/redis.js';

const router = Router();
const PROBE_TIMEOUT_MS = 2000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

async function checkPostgres(): Promise<string> {
  try {
    const pool = getDbPool();
    await withTimeout(pool.query('SELECT 1'), PROBE_TIMEOUT_MS, 'postgres');
    return 'connected';
  } catch (err: any) {
    return `connection_error: ${err?.message || 'unreachable'}`;
  }
}

async function checkRedis(): Promise<string> {
  try {
    const redis = getRedisClient();
    const pong = await withTimeout(redis.ping(), PROBE_TIMEOUT_MS, 'redis');
    return pong === 'PONG' ? 'connected' : `connection_error: unexpected response (${pong})`;
  } catch (err: any) {
    return `connection_error: ${err?.message || 'unreachable'}`;
  }
}

router.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

router.get('/readyz', async (_req: Request, res: Response) => {
  const [postgres, redis] = await Promise.all([checkPostgres(), checkRedis()]);
  const isReady = postgres === 'connected' && redis === 'connected';

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'unready',
    checks: {
      postgres,
      redis,
    },
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

export default router;

