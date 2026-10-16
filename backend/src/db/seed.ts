import { closePool, pool } from '../../../shared/db';
import { logger } from '../../../shared/logger';
import { SEED_PASSWORD, seedDatabase } from './seed-data';

async function main() {
  const exists = await pool.query("SELECT 1 FROM organisations WHERE slug = 'acme'");
  if (exists.rowCount) {
    logger.info('seed data already present; skipping (use npm run db:reset to start over)');
    return;
  }
  const seeded = await seedDatabase(pool);
  const logins = Object.values(seeded).flatMap((o) => Object.values(o.users).map((u) => `${u.email} (${u.role})`));
  logger.info({ logins, password: SEED_PASSWORD }, 'seed complete — demo credentials (development only)');
}

main()
  .catch((err) => {
    logger.error({ err }, 'seed failed');
    process.exitCode = 1;
  })
  .finally(() => closePool());
