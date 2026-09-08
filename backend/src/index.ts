import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { loadConfig } from "./config.js";
import { closePool } from "./db/pool.js";
import { closeRedis } from "./db/redis.js";
import { registerHealthRoutes } from "./routes/health.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
    requestIdHeader: "x-correlation-id",
    genReqId: (req) =>
      (req.headers["x-correlation-id"] as string | undefined) ??
      crypto.randomUUID(),
  });

  await app.register(cors, {
    origin: config.FRONTEND_URL,
    credentials: true,
  });

  await app.register(cookie);

  await registerHealthRoutes(app, config);

  app.get("/", async () => ({
    name: "FieldDesk API",
    version: "0.1.0",
  }));

  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  app.log.info(`API listening on ${config.API_HOST}:${config.API_PORT}`);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down gracefully");
    await app.close();
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
