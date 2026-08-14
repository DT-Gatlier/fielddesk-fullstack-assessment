import { Worker } from 'bullmq';
import { config } from './config';
import { processNotification } from './processors/notificationProcessor';
import { logger } from './utils/logger';

const startWorker = () => {
  logger.info('Starting Notification Worker...');
  logger.info(`Redis URL: ${config.redisUrl}`);

  const worker = new Worker(
    'notifications',
    processNotification,
    {
      connection: {
        url: config.redisUrl,
      },
      concurrency: 5, // Process up to 5 jobs concurrently
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'BullMQ: Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'BullMQ: Job failed');
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'BullMQ: Worker error');
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down worker gracefully...');
    await worker.close();
    logger.info('Worker closed');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

startWorker();
