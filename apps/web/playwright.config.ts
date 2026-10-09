import { defineConfig, devices } from '@playwright/test';

if (!process.env.E2E_DATABASE_URL || !process.env.E2E_REDIS_URL) {
  throw new Error(
    'Use pnpm test:e2e with explicit isolated E2E_DATABASE_URL and E2E_REDIS_URL',
  );
}
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: `./test-results/${process.env.E2E_BROWSER_PROJECT ?? 'all'}`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: 'http://localhost:3101/health/ready',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        NODE_ENV: 'test',
        PORT: '3101',
        DATABASE_URL: process.env.E2E_DATABASE_URL,
        REDIS_URL: process.env.E2E_REDIS_URL,
        REDIS_KEY_PREFIX: `fielddesk-web-test:${Date.now()}`,
        ALLOWED_ORIGINS: 'http://localhost:3100',
        COOKIE_SECURE: 'false',
        SESSION_TTL_SECONDS: '28800',
      },
    },
    {
      command: 'pnpm exec next start --port 3100',
      url: 'http://localhost:3100/login',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
