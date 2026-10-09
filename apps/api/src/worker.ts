import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NotificationService } from './modules/notification/services/notification.service';

async function bootstrapWorker() {
  const logger = new Logger('BackgroundWorker');
  logger.log('Starting autonomous FieldDesk Notification Worker process...');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  const notificationService = app.get(NotificationService);
  const workerId = `worker_${process.pid}_${Math.random().toString(36).slice(2, 6)}`;
  let isRunning = true;

  const pollIntervalMs = 2000; // Poll every 2s

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}. Shutting down worker gracefully...`);
    isRunning = false;
    await app.close();
    logger.log('Worker process stopped cleanly.');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logger.log(`Worker ${workerId} initialized and listening for pending outbox events.`);

  while (isRunning) {
    try {
      const result = await notificationService.processPendingOutboxBatch(10, workerId);
      if (result.processedCount > 0) {
        logger.log(
          `[Batch Summary] Processed: ${result.processedCount} | Delivered: ${result.deliveredCount} | Retrying: ${result.failedCount} | DeadLetter: ${result.deadLetterCount}`,
        );
      }
    } catch (err: unknown) {
      logger.error('Unhandled error during worker loop execution:', err);
    }

    // Sleep before next poll cycle
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

void bootstrapWorker();
