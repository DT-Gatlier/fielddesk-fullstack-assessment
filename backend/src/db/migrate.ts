import { config } from '../../../shared/config';
import { closePool, pool } from '../../../shared/db';
import { logger } from '../../../shared/logger';
import { resetSchema, runMigrations } from './migrator';

async function main() {
  if (process.argv.includes('--reset')) {
    if (config.NODE_ENV === 'production') throw new Error('Refusing to reset the schema in production');
    await resetSchema(pool);
    logger.warn('schema reset');
  }
  const applied = await runMigrations(pool, (m) => logger.info(m));
  logger.info({ applied: applied.length }, 'migrations up to date');
}

main()
  .catch((err) => {
    logger.error({ err }, 'migration failed');
    process.exitCode = 1;
  })
  .finally(() => closePool());
