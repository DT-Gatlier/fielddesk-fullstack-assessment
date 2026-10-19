import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const rootEnvFile = path.resolve(import.meta.dirname, '../.env');
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

// Defaults match .env.example and the Compose services exposed on the host.
const appUrl = process.env.TEST_DATABASE_URL ?? 'postgres://fielddesk_app:change-me-app@localhost:5433/fielddesk_test';
const ownerUrl =
  process.env.TEST_MIGRATION_DATABASE_URL ?? 'postgres://fielddesk_owner:change-me-owner@localhost:5433/fielddesk_test';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: appUrl,
      TEST_DATABASE_URL: appUrl,
      TEST_MIGRATION_DATABASE_URL: ownerUrl,
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
  },
});
