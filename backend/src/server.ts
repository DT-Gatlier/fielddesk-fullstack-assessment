import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { prisma } from './utils/db';
import { logger } from './utils/logger';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await prisma.$connect();
    logger.info('Connected to the database');

    const server = app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });

    const shutdown = async () => {
      logger.info('Shutting down server gracefully...');
      server.close(async () => {
        logger.info('HTTP server closed.');
        await prisma.$disconnect();
        logger.info('Database connection closed.');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
