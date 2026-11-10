require('dotenv/config');
const { spawn } = require('node:child_process');
const Redis = require('ioredis');

const commands = [
  ['api', ['run', 'dev:api']],
  ['web', ['run', 'dev:web']],
  ['worker', ['run', 'dev:worker']],
];

let stopping = false;
let children = [];

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = code;
}

async function start() {
  let redisAvailable = true;
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
    await redis.ping();
  } catch {
    redisAvailable = false;
    console.warn('Redis is unavailable. Starting the API and frontend; notifications remain queued in PostgreSQL. Start Redis and run `npm run dev:worker` to deliver them.');
  } finally {
    redis.disconnect();
  }

  children = commands.filter(([name]) => name !== 'worker' || redisAvailable).map(([name, args]) => {
    const child = spawn('npm', args, {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1' },
    });
    child.on('error', (error) => {
      console.error(`[${name}] ${error.message}`);
      shutdown(1);
    });
    child.on('exit', (code) => {
      if (code && code !== 0) shutdown(code);
    });
    return child;
  });
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
start().catch((error) => {
  console.error(`Could not start FieldDesk: ${error.message}`);
  shutdown(1);
});
