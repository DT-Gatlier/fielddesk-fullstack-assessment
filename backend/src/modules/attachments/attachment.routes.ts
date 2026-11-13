import { Router } from "express";
import multer from "multer";
import { AttachmentController } from "./attachment.controller";
import { authenticate } from "../../middlewares/authenticate";

const router = Router({ mergeParams: true });
const controller = new AttachmentController();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

router.post(
  "/:workOrderId/attachments",
  authenticate,
  upload.single("file"),
  controller.upload.bind(controller)
);

router.get(
  "/:workOrderId/attachments",
  authenticate,
  controller.list.bind(controller)
);

router.get(
  "/:workOrderId/attachments/:attachmentId/download",
  authenticate,
  controller.download.bind(controller)
);

export default router;

