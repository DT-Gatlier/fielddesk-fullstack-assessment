import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_TEST_PORT || 4000);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/browser',
  use: {
    baseURL,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  webServer: {
    command: 'node dist/api/src/server.js',
    env: { PORT: String(port) },
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
  },
});
