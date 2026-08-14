import { Router } from "express";

import { UserRole } from "@prisma/client";

import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

import {
  listWorkOrderAuditLogsController,
} from "./audit-log.controller";

const router = Router();

router.use(authenticate);

router.get(
  "/work-orders/:workOrderId/audit-logs",
  authorize(
    UserRole.OWNER,
    UserRole.DISPATCHER,
    UserRole.TECHNICIAN,
  ),
  listWorkOrderAuditLogsController,
);

export default router;