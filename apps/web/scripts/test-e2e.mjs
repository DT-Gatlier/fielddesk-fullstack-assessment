import { spawnSync } from 'node:child_process';

const raw = process.env.E2E_DATABASE_URL;
if (
  !raw ||
  decodeURIComponent(new URL(raw).pathname) !== '/fielddesk_web_test' ||
  !process.env.E2E_REDIS_URL
) {
  throw new Error(
    'Set E2E_DATABASE_URL to a fresh fielddesk_web_test database and E2E_REDIS_URL to isolated Redis.',
  );
}
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error('Run this script with pnpm test:e2e');
function run(args, env = {}) {
  const result = spawnSync(process.execPath, [pnpm, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
run(['--filter', '@fielddesk/database', 'build']);
run([
  '--filter',
  '@fielddesk/database',
  'exec',
  'tsx',
  'scripts/prepare-web-tests.ts',
]);
run(['--filter', '@fielddesk/api', 'build']);
run(['build'], { NEXT_PUBLIC_API_URL: 'http://localhost:3101' });
// Each browser gets a new API process and isolated rate-limit namespace.
for (const project of ['chromium', 'webkit']) {
  run(['exec', 'playwright', 'test', `--project=${project}`], {
    E2E_BROWSER_PROJECT: project,
  });
}
