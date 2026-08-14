import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";

import { logger } from "./config/logger";
import { requestId } from "./middleware/request-id";

import authTestRoutes from "./modules/auth/auth.test.routes"
import authRoutes from "./modules/auth/auth.routes";
import workOrderRoutes from "./modules/work-orders/work-order.routes";
import progressEventRoutes from "./modules/progress-events/progress-event.routes";
import attachmentRoutes from "./modules/attachments/attachment.routes";
import auditLogRoutes from "./modules/audit-logs/audit-log.routes";

import { errorHandler } from "./middleware/error-handler";
import { notFoundHandler } from "./middleware/not-found";

const app = express();

// security
app.use(helmet());

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// Body parsing
app.use(express.json());

// request id
app.use(requestId);

// HTTP logging
app.use(
  pinoHttp({
    logger: logger,
    genReqId: (req) => req.requestId ?? crypto.randomUUID(),
  }),
);

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

app.use("/api", apiLimiter);

// Health
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "fielddesk-api",
  });
});

// API Routes
app.use("/api/auth-test", authTestRoutes)
app.use("/api/auth", authRoutes);
app.use("/api/work-orders", workOrderRoutes)
app.use("/api", progressEventRoutes);
app.use("/api", attachmentRoutes);
app.use("/api", auditLogRoutes);

// 404 handler
app.use("/api", notFoundHandler);

// Global error handler
app.use(errorHandler);

export default app;
