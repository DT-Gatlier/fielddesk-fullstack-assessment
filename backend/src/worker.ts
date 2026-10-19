import { Redis } from 'ioredis';
import { pino } from 'pino';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { MockProvider } from './notifications/provider.js';
import { createNotificationQueue } from './notifications/queue.js';
import { createNotificationWorker, sweepPendingNotifications } from './notifications/worker.js';

/**
 * Background worker entry point. Runs as its own process/container, independent of the API, and
 * shares only the data-access and domain modules with it.
 */
const SWEEP_INTERVAL_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 30_000;

const config = loadConfig();
const log = pino({ level: config.LOG_LEVEL, base: { service: 'worker' } });
const pool = createPool(config.DATABASE_URL, 5);
// BullMQ workers need blocking commands, which require maxRetriesPerRequest: null.
const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const providerRedis = connection.duplicate();
const queue = createNotificationQueue(connection.duplicate(), {
  maxAttempts: config.NOTIFICATION_MAX_ATTEMPTS,
  backoffMs: config.NOTIFICATION_BACKOFF_MS,
});

const provider = new MockProvider(providerRedis, config.MOCK_PROVIDER_MODE);
const worker = createNotificationWorker({ pool, provider, redis: providerRedis, log }, { connection });

pool.on('error', (error) => log.error({ err: error }, 'idle database client error'));
connection.on('error', (error) => log.warn({ err: error }, 'redis error'));

const sweep = setInterval(() => {
  sweepPendingNotifications({ pool, log }, queue).catch((error) => log.error({ err: error }, 'recovery sweep failed'));
}, SWEEP_INTERVAL_MS);

log.info(
  { maxAttempts: config.NOTIFICATION_MAX_ATTEMPTS, backoffMs: config.NOTIFICATION_BACKOFF_MS, providerMode: await provider.mode() },
  'notification worker started',
);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, 'worker shutting down; waiting for active jobs');
  const force = setTimeout(() => {
    log.error('worker shutdown timed out; exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();
  try {
    clearInterval(sweep);
    // Stops taking new jobs and waits for in-flight ones; anything interrupted is retried by BullMQ's
    // stalled-job recovery, and the processor is idempotent.
    await worker.close();
    await queue.close();
    await pool.end();
    await providerRedis.quit();
    await connection.quit();
    log.info('worker stopped');
    process.exit(0);
  } catch (error) {
    log.error({ err: error }, 'error during worker shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
