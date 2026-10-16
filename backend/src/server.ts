export {};
process.env.SERVICE_NAME ??= 'fielddesk-api';

const { config } = await import('../../shared/config');
const { closePool } = await import('../../shared/db');
const { logger } = await import('../../shared/logger');
const { createRedis } = await import('../../shared/redis');
const { createApp, lifecycle } = await import('./app');
const { LocalDiskStorage } = await import('./modules/attachments/storage');
const { RealtimeHub } = await import('./modules/realtime/hub');

const storage = new LocalDiskStorage(config.STORAGE_DIR);
await storage.init();

const redis = createRedis('api');
const realtime = new RealtimeHub(createRedis('api-realtime-sub'));
await realtime.start();

const app = createApp({ redis, realtime, storage });
const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'api listening'));
// Slightly longer than typical load-balancer idle timeouts to avoid 502s on reused connections.
server.keepAliveTimeout = 65_000;

/**
 * Graceful shutdown: fail readiness, stop accepting connections, close SSE
 * streams (clients reconnect to another instance), let in-flight requests
 * finish, then close Redis and the database pool. A hard deadline prevents
 * hanging forever.
 */
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  lifecycle.shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  const deadline = setTimeout(() => {
    logger.error('shutdown timed out; forcing exit');
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS);
  deadline.unref();

  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  await realtime.stop();
  server.closeIdleConnections();
  await closed;
  await redis.quit().catch(() => redis.disconnect());
  await closePool();
  logger.info('shutdown complete');
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled promise rejection'));
