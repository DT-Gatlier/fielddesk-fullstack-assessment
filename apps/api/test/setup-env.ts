// Explicit fixtures: tests do not read local environment files or contact services.
process.env.NODE_ENV = 'test';
process.env.PORT = '3101';
process.env.DATABASE_URL =
  'postgresql://test:test_password@localhost:5432/fielddesk_test';
process.env.REDIS_URL = 'redis://localhost:6379/15';
process.env.COOKIE_SECURE = 'false';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.SESSION_TTL_SECONDS = '28800';
process.env.REDIS_KEY_PREFIX = 'fielddesk-unit-test';
