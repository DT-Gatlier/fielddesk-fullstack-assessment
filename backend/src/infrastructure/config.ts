import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from project root or current directory
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(16).default('fielddesk_super_secret_jwt_key_32_bytes_min_length_for_hmac_sha256!'),
  JWT_EXPIRES_IN: z.coerce.number().default(900), // 15 minutes (900s)
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().default(7), // 7 days
  DATABASE_URL: z.string().default('postgresql://fielddesk:fielddesk123@localhost:5432/fielddesk'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(5),
  AUTH_RATE_LIMIT_WINDOW_SECS: z.coerce.number().default(300), // 5 minutes
  EVENT_RATE_LIMIT_MAX: z.coerce.number().default(60),
  EVENT_RATE_LIMIT_WINDOW_SECS: z.coerce.number().default(60), // 1 minute
  QUEUE_NAME: z.string().default('technician-notifications'),
  NOTIFICATION_SIMULATION_MODE: z.enum(['always_success', 'temporary_failure', 'permanent_failure', 'random']).default('always_success'),
  ENABLE_EMBEDDED_WORKER: z.preprocess((val) => val === undefined ? true : val === 'true' || val === true, z.boolean()).default(true),
});

export type Config = z.infer<typeof configSchema>;

export const config: Config = configSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  LOG_LEVEL: process.env.LOG_LEVEL,
  PORT: process.env.PORT,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_DAYS: process.env.REFRESH_TOKEN_EXPIRES_DAYS,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  AUTH_RATE_LIMIT_MAX: process.env.AUTH_RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_SECS: process.env.AUTH_RATE_LIMIT_WINDOW_SECS,
  EVENT_RATE_LIMIT_MAX: process.env.EVENT_RATE_LIMIT_MAX,
  EVENT_RATE_LIMIT_WINDOW_SECS: process.env.EVENT_RATE_LIMIT_WINDOW_SECS,
  QUEUE_NAME: process.env.QUEUE_NAME,
  NOTIFICATION_SIMULATION_MODE: process.env.NOTIFICATION_SIMULATION_MODE,
  ENABLE_EMBEDDED_WORKER: process.env.ENABLE_EMBEDDED_WORKER,
});

