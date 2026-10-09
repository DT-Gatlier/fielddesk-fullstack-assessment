import nextConfig from '@fielddesk/eslint-config/next';

const config = [
  ...nextConfig,
  {
    ignores: ['src/api/schema.d.ts', 'playwright-report/**', 'test-results/**'],
  },
];
export default config;
