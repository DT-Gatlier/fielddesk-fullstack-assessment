import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config.js";
import { getPool } from "../db/pool.js";
import {
  authenticate,
  clearAuthCookie,
  setAuthCookie,
} from "../middleware/auth.js";
import {
  authenticateUser,
  getAuthenticatedUser,
  toPublicUser,
} from "../services/auth.service.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerAuthRoutes(
  app: FastifyInstance,
  config: Env,
): Promise<void> {
  const pool = getPool(config);
  const secureCookie = config.FRONTEND_URL.startsWith("https://");

  app.post(
    "/api/v1/auth/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const user = await authenticateUser(pool, body.email, body.password);

      const token = await reply.jwtSign({
        sub: user.id,
        org: user.organisationId,
        role: user.role,
        email: user.email,
      });

      setAuthCookie(reply, token, secureCookie);

      return {
        user: toPublicUser(user),
      };
    },
  );

  app.post("/api/v1/auth/logout", async (_request, reply) => {
    clearAuthCookie(reply);
    return { success: true };
  });

  app.get(
    "/api/v1/auth/me",
    { preHandler: [authenticate] },
    async (request) => {
      const user = await getAuthenticatedUser(pool, request.auth);
      return { user: toPublicUser(user) };
    },
  );
}
