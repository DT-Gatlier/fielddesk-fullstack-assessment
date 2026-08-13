import express from "express";
import authTestRoutes from "./modules/auth/auth.test.routes"
import authRoutes from "./modules/auth/auth.routes";
import workOrderRoutes from "./modules/work-orders/work-order.routes";
import progressEventRoutes from "./modules/progress-events/progress-event.routes";
import attachmentRoutes from "./modules/attachments/attachment.routes";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "fielddesk-api",
  });
});

app.use("/api/auth-test", authTestRoutes)
app.use("/api/auth", authRoutes);
app.use("/api/work-orders", workOrderRoutes)
app.use("/api", progressEventRoutes);
app.use("/api", attachmentRoutes);

export default app;
