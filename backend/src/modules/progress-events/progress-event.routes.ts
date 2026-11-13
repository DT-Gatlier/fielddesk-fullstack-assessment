import { Router } from "express";
import { ProgressEventController } from "./progress-event.controller";
import { authenticate } from "../../middlewares/authenticate";
import rateLimit from "express-rate-limit";

const router = Router();
const controller = new ProgressEventController();

router.post("/", authenticate, rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }), controller.submitEvent.bind(controller));
router.get("/:workOrderId", authenticate, controller.listEvents.bind(controller));

export default router;

