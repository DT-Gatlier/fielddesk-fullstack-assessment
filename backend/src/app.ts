import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import authRoutes from "./modules/auth/auth.routes";
import workOrderRoutes from "./modules/work-orders/work-order.routes";
import progressEventRoutes from "./modules/progress-events/progress-event.routes";
import attachmentRoutes from "./modules/attachments/attachment.routes";
import realtimeRoutes from "./modules/realtime/realtime.routes";
import adminRoutes from "./modules/admin/admin.routes";
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";

const app = express();

app.use(helmet());
app.use(pinoHttp({
  genReqId: (req) => req.headers["x-request-id"]?.toString() || randomUUID(),
  redact: { paths: ["req.headers.cookie", "req.headers.authorization", "res.headers.set-cookie"], censor: "[REDACTED]" },
}));
app.use((req, res, next) => {
  res.setHeader("X-Request-Id", String((req as Request & { id?: string }).id || randomUUID()));
  next();
});

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "FieldDesk API is running",
  });
});

app.get("/ready", async (_req: Request, res: Response) => {
  try {
    const { prisma } = await import("./config/prisma.js");
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ success: true, ready: true });
  } catch {
    res.status(503).json({ success: false, ready: false });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/work-orders", workOrderRoutes);
app.use("/api/work-orders", attachmentRoutes);
app.use("/api/progress-events", progressEventRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/admin", adminRoutes);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || (err.name === "ZodError" ? 400 : 500);
  res.status(status).json({
    success: false,
    message: status >= 500 ? "An unexpected error occurred" : err.message || "Request failed",
  });
});

export default app;
