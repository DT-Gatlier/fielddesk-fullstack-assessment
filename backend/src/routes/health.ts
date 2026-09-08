import type { FastifyInstance } from "fastify";
import type { Env } from "../config.js";
import { checkDatabase } from "../db/pool.js";
import { checkRedis } from "../db/redis.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
  config: Env,
): Promise<void> {
  app.get("/health", async () => ({
    status: "ok",
    service: "fielddesk-api",
  }));

  app.get("/ready", async (_request, reply) => {
    try {
      await checkDatabase(config);
      await checkRedis(config);
      return {
        status: "ready",
        checks: {
          database: "ok",
          redis: "ok",
        },
      };
    } catch (error) {
      app.log.error({ err: error }, "Readiness check failed");
      return reply.status(503).send({
        status: "not_ready",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
