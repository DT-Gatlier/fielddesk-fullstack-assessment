import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { Redis } from "ioredis";
import pino from "pino";

loadEnv({ path: resolve(process.cwd(), "../.env") });
loadEnv();

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

async function main(): Promise<void> {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

  redis.on("error", (error) => {
    log.error({ err: error }, "Redis connection error");
  });

  await redis.ping();
  log.info({ redisUrl }, "FieldDesk worker connected to Redis — ready for notification jobs (Phase 7)");

  const shutdown = async (signal: string) => {
    log.info({ signal }, "Worker shutting down");
    await redis.quit();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  log.error({ err: error }, "Worker failed to start");
  process.exit(1);
});
