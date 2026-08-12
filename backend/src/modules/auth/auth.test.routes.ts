import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.get(
  "/owner-only",
  authenticate,
  authorize("OWNER"),
  (_req, res) => {
    return res.json({
      message: "Owner access granted",
    });
  },
);

router.get(
  "/dispatcher-only",
  authenticate,
  authorize("DISPATCHER"),
  (_req, res) => {
    return res.json({
      message: "Dispatcher access granted",
    });
  },
);

router.get(
  "/technician-only",
  authenticate,
  authorize("TECHNICIAN"),
  (_req, res) => {
    return res.json({
      message: "Technician access granted",
    });
  },
);

export default router;