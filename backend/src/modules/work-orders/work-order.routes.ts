import { Router } from "express";
import { WorkOrderController } from "./work-order.controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";

const router = Router();
const controller = new WorkOrderController();

router.get("/", authenticate, controller.list.bind(controller));
router.get("/export", authenticate, controller.exportCsv.bind(controller));
router.get("/metrics", authenticate, controller.getMetrics.bind(controller));
router.get("/technicians", authenticate, controller.getTechnicians.bind(controller));
router.get("/:id", authenticate, controller.getById.bind(controller));
router.post(
  "/",
  authenticate,
  authorize("OWNER", "DISPATCHER"),
  controller.create.bind(controller)
);
router.put("/:id", authenticate, controller.update.bind(controller));

export default router;

