import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import type { Env } from "./config.js";
import { loadConfig } from "./config.js";
import { registerErrorHandler } from "./lib/errors.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
import { registerProgressEventRoutes } from "./routes/progress-events.js";
import { registerWorkOrderRoutes } from "./routes/work-orders.js";

export async function buildApp(config: Env = loadConfig()) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
    requestIdHeader: "x-correlation-id",
    genReqId: (req) =>
      (req.headers["x-correlation-id"] as string | undefined) ??
      crypto.randomUUID(),
  });

  registerErrorHandler(app);

  await app.register(cors, {
    origin: config.FRONTEND_URL,
    credentials: true,
  });

  await app.register(cookie);

  await app.register(multipart, {
    limits: {
      fileSize: config.MAX_ATTACHMENT_BYTES,
      files: 1,
    },
  });

  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_EXPIRES_IN,
    },
  });

  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => ({
      error: {
        code: "RATE_LIMITED",
        message: `Too many requests. Retry after ${context.after}`,
        details: [],
      },
    }),
  });

  await registerHealthRoutes(app, config);
  await registerAuthRoutes(app, config);
  await registerUserRoutes(app, config);
  await registerWorkOrderRoutes(app, config);
  await registerProgressEventRoutes(app, config);
  await registerAttachmentRoutes(app, config);

  app.get("/", async () => ({
    name: "FieldDesk API",
    version: "0.1.0",
  }));

  return app;
}
