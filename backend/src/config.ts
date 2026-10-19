import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// Local development convenience: load the repository-level .env if present.
// Variables already set in the environment (Docker, CI, tests) take precedence.
const rootEnvFile = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_TTL_HOURS: z.coerce.number().positive().max(24 * 30).default(12),
  COOKIE_SECURE: booleanString,
  // Set when the API is only reachable through a reverse proxy (nginx in Compose, a load balancer in
  // production), so request.ip and rate limiting use the client address from X-Forwarded-For.
  TRUST_PROXY: booleanString,
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  EVENT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  EVENT_RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  UPLOAD_DIR: z.string().default(path.resolve(import.meta.dirname, '../../uploads')),
  MAX_ATTACHMENT_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  NOTIFICATION_BACKOFF_MS: z.coerce.number().int().min(10).default(2000),
  MOCK_PROVIDER_MODE: z.enum(['success', 'temporary_failure', 'permanent_failure', 'fail_twice']).default('success'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n  ${problems.join('\n  ')}`);
  }
  return result.data;
}
