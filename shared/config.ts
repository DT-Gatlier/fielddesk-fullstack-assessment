import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Environment-based configuration shared by the API and the worker.
 * Values are validated once at startup so a misconfigured process fails fast
 * instead of misbehaving later.
 */

// Local development convenience: load ./.env when present (never in tests, never required).
const envFile = resolve(process.cwd(), '.env');
if (process.env.NODE_ENV !== 'test' && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  REDIS_URL: z.string().url(),
  TRUST_PROXY: bool.default('false'),

  // Sessions
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  COOKIE_SECURE: bool.default('false'),
  // Comma-separated list of origins allowed to make state-changing requests.
  TRUSTED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8080'),

  // Attachments
  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  DEFAULT_ORG_STORAGE_LIMIT_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),

  // Rate limits
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_LOGIN_WINDOW_SEC: z.coerce.number().int().positive().default(15 * 60),
  RATE_LIMIT_EVENTS_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_EVENTS_WINDOW_SEC: z.coerce.number().int().positive().default(60),

  // Worker / notifications
  NOTIFY_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  NOTIFY_BACKOFF_BASE_MS: z.coerce.number().int().min(1).default(1000),
  NOTIFY_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  OUTBOX_POLL_MS: z.coerce.number().int().positive().default(1000),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MOCK_PROVIDER_MODE: z
    .enum(['success', 'temporary_failure', 'permanent_failure', 'flaky'])
    .default('success'),
  MOCK_PROVIDER_FLAKY_FAILURES: z.coerce.number().int().min(0).default(2),
  MOCK_PROVIDER_LATENCY_MS: z.coerce.number().int().min(0).default(100),

  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
});

export type Config = z.infer<typeof schema>;

function load(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`Invalid configuration:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const config: Config = load();
