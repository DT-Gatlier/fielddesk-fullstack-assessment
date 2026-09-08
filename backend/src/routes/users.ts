import type { FastifyInstance } from "fastify";
import type { Env } from "../config.js";
import { getPool } from "../db/pool.js";
import { AppError } from "../lib/errors.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { toPublicUser } from "../services/auth.service.js";
import {
  findUserByIdInOrg,
  listUsersInOrg,
} from "../repositories/users.repository.js";

export async function registerUserRoutes(
  app: FastifyInstance,
  config: Env,
): Promise<void> {
  const pool = getPool(config);

  app.get(
    "/api/v1/users",
    { preHandler: [authenticate, requireRole("owner", "dispatcher")] },
    async (request) => {
      const users = await listUsersInOrg(pool, request.auth.organisationId);
      return { users: users.map(toPublicUser) };
    },
  );

  app.get(
    "/api/v1/users/:userId",
    { preHandler: [authenticate] },
    async (request) => {
      const { userId } = request.params as { userId: string };

      const user = await findUserByIdInOrg(
        pool,
        userId,
        request.auth.organisationId,
      );

      if (!user) {
        throw new AppError("NOT_FOUND", "User not found", 404);
      }

      return { user: toPublicUser(user) };
    },
  );
}
