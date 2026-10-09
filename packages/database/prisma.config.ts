import { defineConfig } from 'prisma/config';
import { loadDevelopmentEnvironment } from './scripts/environment';

if (!process.argv.includes('generate')) loadDevelopmentEnvironment();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  // Generation does not need credentials. Mutation wrappers validate real URLs.
  datasource: {
    url: process.argv.includes('generate')
      ? undefined
      : process.env.DATABASE_URL,
  },
});
