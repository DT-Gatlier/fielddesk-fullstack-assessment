import { loadConfig } from './config.js';
import { createPool } from './database/pool.js';
import { RedisRuntime } from './infrastructure/runtime.js';
import { NotificationWorkerService } from './modules/notifications/notification.worker.js';

const config = loadConfig(); const database = createPool(config); const runtime = new RedisRuntime(config);
await runtime.start();
const worker = new NotificationWorkerService(database, config, runtime); worker.start();
console.info(JSON.stringify({ level: 'info', message: 'notification worker started', queue: config.NOTIFICATION_QUEUE_NAME }));

let closing = false;
async function shutdown(signal: string) {
  if (closing) return; closing = true;
  console.info(JSON.stringify({ level: 'info', message: 'notification worker stopping', signal }));
  await worker.close(); await runtime.close(); await database.end(); process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
