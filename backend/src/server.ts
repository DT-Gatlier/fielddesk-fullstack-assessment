import { createApp } from './app.js';
import { config } from './infrastructure/config.js';
import { logger } from './infrastructure/logger.js';
import { closeDbPool } from './infrastructure/db.js';
import { closeRedisConnections } from './infrastructure/redis.js';
import { notificationQueue } from './queues/notification.queue.js';
import { sseManager } from './realtime/sse-manager.js';

const app = createApp();
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'FieldDesk API Server started');
});

let isShuttingDown = false;

export async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info({ signal }, 'Received termination signal, shutting down gracefully...');

  // Close SSE streams so keep-alive connections do not block server.close()
  sseManager.destroy();

  const forceTimer = setTimeout(() => {
    logger.error('Forcefully terminating process after 10s drain timeout');
    process.exit(1);
  }, 10000);
  forceTimer.unref();

  server.close(async (closeErr) => {
    let exitCode = 0;

    if (closeErr) {
      logger.error({ err: closeErr.message }, 'Error closing HTTP server');
      exitCode = 1;
    }

    try {
      await notificationQueue.close();
      await closeDbPool();
      await closeRedisConnections();
      logger.info('HTTP server, queue, database pool, and Redis closed cleanly.');
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Error during graceful resource cleanup');
      exitCode = 1;
    } finally {
      clearTimeout(forceTimer);
      process.exit(exitCode);
    }
  });
}

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});
