import { createDatabaseClient } from '../src';
import { seedDatabase } from './seed-data';
import {
  loadDevelopmentEnvironment,
  requireDatabaseUrl,
} from '../scripts/environment';

async function main(): Promise<void> {
  loadDevelopmentEnvironment();
  if (process.env.NODE_ENV === 'production')
    throw new Error('Sample seeding is disabled in production');
  const client = createDatabaseClient(
    requireDatabaseUrl(process.env.DATABASE_URL),
  );
  try {
    await seedDatabase(client);
    console.log('Sample organisations and users seeded successfully');
  } finally {
    await client.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Seeding failed; check configuration and database availability',
  );
  process.exitCode = 1;
});
