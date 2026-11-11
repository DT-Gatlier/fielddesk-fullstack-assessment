import { createTechnicianNotificationWorker } from './technician-notification.worker.js';
import { closeDbPool } from '../infrastructure/db.js';
import { logger } from '../infrastructure/logger.js';
import { getBullRedisConnection } from '../infrastructure/redis.js';

logger.info('Initializing FieldDesk Background Notification Worker (Backend)...');

const worker = createTechnicianNotificationWorker();
const redis = getBullRedisConnection();

logger.info('Technician notification worker is active and awaiting jobs');

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Stopping worker gracefully...');
  try {
    await worker.close();
    await closeDbPool();
    await redis.quit();
    logger.info('Worker resources cleanly disposed');
    process.exit(0);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error during worker graceful shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

