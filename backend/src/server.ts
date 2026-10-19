import { Redis } from 'ioredis';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';

const SHUTDOWN_TIMEOUT_MS = 15_000;

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2, connectTimeout: 2000 });
const app = await buildApp({ config, pool, redis });

pool.on('error', (error) => app.log.error({ err: error }, 'idle database client error'));
redis.on('error', (error) => app.log.warn({ err: error }, 'redis error'));

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  app.log.info({ signal }, 'shutting down');
  // Readiness starts failing immediately so a load balancer stops sending new requests.
  app.shuttingDown = true;

  const forceExit = setTimeout(() => {
    app.log.error('graceful shutdown timed out; exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    // Stops accepting connections and waits for in-flight requests to finish.
    await app.close();
    await pool.end();
    await redis.quit();
    app.log.info('shutdown complete');
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.fatal({ err: error }, 'failed to start');
  process.exit(1);
}
