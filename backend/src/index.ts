import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { closePool } from "./db/pool.js";
import { closeRedis } from "./db/redis.js";
import { closeNotificationQueue } from "./queues/notifications.queue.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp(config);

  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  app.log.info(`API listening on ${config.API_HOST}:${config.API_PORT}`);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down gracefully");
    await app.close();
    await closeNotificationQueue();
    await closePool();
    await closeRedis();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
