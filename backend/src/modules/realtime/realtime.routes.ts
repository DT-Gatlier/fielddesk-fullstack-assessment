import { Router, Request, Response } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { realtimeService } from "./realtime.service";

const router = Router();

router.get("/", authenticate, (req: Request, res: Response) => {
  const organisationId = req.auth?.organisationId;
  if (!organisationId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  realtimeService.subscribe(organisationId, res);

  req.on("close", () => {
    realtimeService.unsubscribe(organisationId, res);
  });
});

export default router;

