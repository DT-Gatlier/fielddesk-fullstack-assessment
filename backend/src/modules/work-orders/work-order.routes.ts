import { Router } from "express";

import {
  createWorkOrderController,
  getWorkOrderController,
  listWorkOrdersController,
  updateWorkOrderController,
} from "./work-order.controller";

import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

import { UserRole } from "@prisma/client";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  listWorkOrdersController,
);

router.get(
  "/:id",
  getWorkOrderController,
);

router.post(
  "/",
  authorize(UserRole.OWNER, UserRole.DISPATCHER),
  createWorkOrderController,
);

router.patch(
  "/:id",
  authorize(UserRole.OWNER, UserRole.DISPATCHER),
  updateWorkOrderController,
);

export default router;