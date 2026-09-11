import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import pino from "pino";
import { loadConfig } from "../../backend/src/config.js";
import { getPool, closePool } from "../../backend/src/db/pool.js";
import { startNotificationWorker } from "../../backend/src/workers/notification-worker.js";

loadEnv({ path: resolve(process.cwd(), "../.env") });
loadEnv();

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = getPool(config);
  const worker = startNotificationWorker(pool, config, log);

  log.info(
    {
      queue: "notifications",
      mockMode: config.NOTIFICATION_MOCK_MODE,
    },
    "FieldDesk notification worker started",
  );

  const shutdown = async (signal: string) => {
    log.info({ signal }, "Worker shutting down");
    await worker.close();
    await closePool();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  log.error({ err: error }, "Worker failed to start");
  process.exit(1);
});
