import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadDevelopmentEnvironment, requireDatabaseUrl } from './environment';

loadDevelopmentEnvironment();
requireDatabaseUrl(process.env.DATABASE_URL);
const commands: Record<string, string[]> = {
  'migrate-dev': ['migrate', 'dev'],
  'migrate-deploy': ['migrate', 'deploy'],
  seed: ['db', 'seed'],
  studio: ['studio'],
};
const args = commands[process.argv[2]];
if (!args) throw new Error('Unknown database command');
const result = spawnSync(
  process.execPath,
  [require.resolve('prisma/build/index.js'), ...args, ...process.argv.slice(3)],
  {
    cwd: resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  },
);
if (result.error) throw new Error('Unable to start database command');
process.exitCode = result.status ?? 1;
