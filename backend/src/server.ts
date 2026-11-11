import { createApp } from './app.js';
import { config } from './infrastructure/config.js';
import { logger } from './infrastructure/logger.js';
import { getDbPool } from './infrastructure/db.js';
import {
  startTechnicianNotificationWorker,
  stopTechnicianNotificationWorker,
} from './workers/technician-notification.worker.js';

const app = createApp();
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'FieldDesk API Server started');
  if (config.ENABLE_EMBEDDED_WORKER) {
    startTechnicianNotificationWorker();
  }
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Received termination signal, shutting down gracefully...');
  server.close(async () => {
    try {
      if (config.ENABLE_EMBEDDED_WORKER) {
        await stopTechnicianNotificationWorker();
      }
      const pool = getDbPool();
      await pool.end();
      logger.info('Database pool closed.');
    } catch (err: any) {
      logger.error({ err: err.message }, 'Error closing database pool');
    }
    process.exit(0);
  });

  // Force exit after 10s timeout
  setTimeout(() => {
    logger.error('Forcefully terminating process after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

