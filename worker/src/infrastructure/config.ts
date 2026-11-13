import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from project root or current directory
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().default('postgresql://fielddesk:fielddesk123@localhost:5432/fielddesk'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  QUEUE_NAME: z.string().default('technician-notifications'),
  NOTIFICATION_SIMULATION_MODE: z.enum(['always_success', 'temporary_failure', 'permanent_failure', 'random']).default('always_success'),
});

export type Config = z.infer<typeof configSchema>;

export const config: Config = configSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  LOG_LEVEL: process.env.LOG_LEVEL,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  QUEUE_NAME: process.env.QUEUE_NAME,
  NOTIFICATION_SIMULATION_MODE: process.env.NOTIFICATION_SIMULATION_MODE,
});

