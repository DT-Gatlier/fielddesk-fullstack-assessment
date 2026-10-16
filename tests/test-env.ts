/**
 * Environment for the integration test suite. Tests run against REAL
 * PostgreSQL and Redis (the database behaviour — constraints, locks,
 * transactions — is exactly what is under test). Override the URLs with
 * TEST_DATABASE_URL / TEST_REDIS_URL; `docker compose up -d postgres redis`
 * provides matching defaults.
 */
export const testEnv: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? `postgres://fielddesk:fielddesk_dev_password@localhost:${process.env.POSTGRES_HOST_PORT ?? '55432'}/fielddesk_test`,
  // Separate logical Redis DB so tests never touch development data.
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15',
  STORAGE_DIR: process.env.TEST_STORAGE_DIR ?? './.test-storage',
  MAX_UPLOAD_BYTES: String(1024 * 1024), // 1 MiB
  DEFAULT_ORG_STORAGE_LIMIT_BYTES: String(5 * 1024 * 1024),
  RATE_LIMIT_LOGIN_MAX: '5',
  RATE_LIMIT_LOGIN_WINDOW_SEC: '60',
  RATE_LIMIT_EVENTS_MAX: '1000',
  NOTIFY_MAX_ATTEMPTS: '4',
  NOTIFY_BACKOFF_BASE_MS: '20',
  NOTIFY_PROVIDER_TIMEOUT_MS: '2000',
  OUTBOX_POLL_MS: '50',
  MOCK_PROVIDER_MODE: 'success',
  MOCK_PROVIDER_FLAKY_FAILURES: '2',
  MOCK_PROVIDER_LATENCY_MS: '0',
  SSE_HEARTBEAT_MS: '60000',
  TRUSTED_ORIGINS: 'http://localhost:5173',
  SEED_PASSWORD: 'Password123!',
};
