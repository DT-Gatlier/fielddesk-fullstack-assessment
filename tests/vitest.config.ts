import { defineConfig } from 'vitest/config';
import { testEnv } from './test-env';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    root: '.',
    include: ['tests/**/*.test.{ts,tsx}'],
    globalSetup: ['tests/global-setup.ts'],
    env: testEnv,
    // The suite shares one database; files run one at a time so each file can
    // reset and reseed it. Concurrency is exercised INSIDE individual tests.
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
