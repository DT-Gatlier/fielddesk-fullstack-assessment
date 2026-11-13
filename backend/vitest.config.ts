import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, '..'),
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts', 'backend/src/**/*.{test,spec}.ts', 'worker/src/**/*.{test,spec}.ts'],
  },
  resolve: {
    alias: [
      { find: '@/workers', replacement: path.resolve(__dirname, '../worker/src') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: /^([^.\/]|@[^\/]+)(.*)$/, replacement: `${path.resolve(__dirname, 'node_modules')}/$1$2` },
    ],
  },
});
