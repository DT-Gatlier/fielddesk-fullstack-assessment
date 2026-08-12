import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { createPool } from './database/pool.js';
import { createApp } from './app.js';
import { RedisRuntime } from './infrastructure/runtime.js';

const config = loadConfig();
const database = createPool(config);
const runtime = new RedisRuntime(config);
await runtime.start().catch((error) => console.error(JSON.stringify({ level: 'error', message: 'Redis unavailable; starting API in degraded mode', error: (error as Error).message })));
const server = createServer(createApp(database, config, runtime));

server.listen(config.PORT, () => console.info(JSON.stringify({ level: 'info', message: 'API listening', port: config.PORT })));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(JSON.stringify({ level: 'info', message: 'Graceful shutdown started', signal }));
  server.close(async () => {
    await runtime.close(); await database.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
