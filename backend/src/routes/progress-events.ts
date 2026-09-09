import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config.js";
import { getPool } from "../db/pool.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { submitProgressEvent } from "../services/progress-events.service.js";

const progressEventTypeSchema = z.enum(["status_changed", "note_added"]);

const submitSchema = z.object({
  eventId: z.string().min(1).max(200),
  workOrderId: z.string().uuid(),
  type: progressEventTypeSchema,
  occurredAt: z.string().datetime(),
  payload: z.record(z.unknown()),
});

export async function registerProgressEventRoutes(
  app: FastifyInstance,
  config: Env,
): Promise<void> {
  const pool = getPool(config);

  app.post(
    "/api/v1/progress-events",
    {
      preHandler: [authenticate, requireRole("technician")],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request) => {
      const body = submitSchema.parse(request.body);
      return submitProgressEvent(pool, request.auth, body);
    },
  );
}
