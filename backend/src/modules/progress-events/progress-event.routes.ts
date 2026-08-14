import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

import { UserRole } from "@prisma/client";

import {
  createProgressEventController,
} from "./progress-event.controller";

const router = Router();

router.use(authenticate);

router.post(
  "/work-orders/:workOrderId/events",
  authorize(
    UserRole.OWNER,
    UserRole.DISPATCHER,
    UserRole.TECHNICIAN,
  ),
  createProgressEventController,
);

export default router;