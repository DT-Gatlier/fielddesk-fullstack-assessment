import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config.js";
import { getPool } from "../db/pool.js";
import { authenticate } from "../middleware/auth.js";
import { createWorkOrdersCsvStream } from "../services/exports.service.js";

const exportQuerySchema = z.object({
  search: z.string().optional(),
  status: z
    .enum(["draft", "scheduled", "in_progress", "completed", "cancelled"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  sortBy: z
    .enum(["created_at", "scheduled_start", "priority", "status"])
    .default("created_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export async function registerExportRoutes(
  app: FastifyInstance,
  config: Env,
): Promise<void> {
  const pool = getPool(config);

  app.get(
    "/api/v1/exports/work-orders.csv",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const query = exportQuerySchema.parse(request.query);
      const stream = createWorkOrdersCsvStream(pool, request.auth, query);

      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header(
          "Content-Disposition",
          'attachment; filename="work-orders.csv"',
        )
        .send(stream);
    },
  );
}
