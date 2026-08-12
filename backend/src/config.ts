import { z } from 'zod';
import path from 'node:path';

for (const candidate of [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../.env')]) {
  try { process.loadEnvFile(candidate); break; } catch { /* Environment variables may be supplied by the process manager. */ }
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  DEFAULT_ORG_STORAGE_LIMIT_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(30),
  NOTIFICATION_QUEUE_NAME: z.string().default('fielddesk-notifications'),
  NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  NOTIFICATION_BACKOFF_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_POLL_MS: z.coerce.number().int().min(250).default(1000),
  MOCK_NOTIFICATION_MODE: z.enum(['success', 'temporary_failure', 'permanent_failure', 'flaky']).default('success'),
  LOG_LEVEL: z.string().default('info')
});

export type Config = z.infer<typeof schema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(environment);
}
