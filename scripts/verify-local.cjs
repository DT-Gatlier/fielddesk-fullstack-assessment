require('dotenv/config');
const { Client } = require('pg');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Local verification requires a localhost PostgreSQL connection.');
  }
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'fielddesk_assessment_test'");
    if (!exists.rowCount) await admin.query('CREATE DATABASE fielddesk_assessment_test');
  } finally {
    await admin.end();
  }
  url.pathname = '/fielddesk_assessment_test';
  const tempDirectory = path.resolve('.tmp');
  fs.mkdirSync(tempDirectory, { recursive: true });
  const env = {
    ...process.env,
    DATABASE_URL: url.toString(),
    PLAYWRIGHT_TEST_PORT: process.env.PLAYWRIGHT_TEST_PORT || '4011',
    CI: '1',
    TEMP: tempDirectory,
    TMP: tempDirectory,
  };
  const commands = [
    'npm run db:generate',
    'npm run db:migrate',
    'npm run db:seed',
    'npm run lint',
    'npm run build',
    'npm test',
    'npm run test:browser',
  ];
  console.log('Verification uses fielddesk_assessment_test; the application database is unchanged.');
  const selectedCommands = process.argv.includes('--browser-only') ? ['npm run test:browser'] : commands;
  for (const command of selectedCommands) {
    console.log(`\nRunning: ${command}`);
    const result = spawnSync(command, { env, shell: true, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`Failed: ${command}`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
