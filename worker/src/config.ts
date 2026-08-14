import dotenv from 'dotenv';
dotenv.config();

export const config = {
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  dbUrl: process.env.DATABASE_URL || 'postgresql://fielddesk:fielddesk_dev@localhost:5433/fielddesk',
  mockProvider: {
    failureRate: parseFloat(process.env.NOTIFICATION_PROVIDER_FAILURE_RATE || '0.3'),
    permanentFailureRate: parseFloat(process.env.NOTIFICATION_PROVIDER_PERMANENT_FAILURE_RATE || '0.1'),
  },
};
