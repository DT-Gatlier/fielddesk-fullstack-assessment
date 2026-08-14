import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";

import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

import { UserRole } from "@prisma/client";

import {
  deleteAttachmentController,
  getAttachmentController,
  listAttachmentsController,
  uploadAttachmentController,
} from "./attachment.controller";

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.resolve("storage/uploads"));
    },

    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname);

      const filename = `${crypto.randomUUID()}${extension}`;

      cb(null, filename);
    },
  }),

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "text/plain",
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Unsupported file type"));
    }

    cb(null, true);
  },
});

router.use(authenticate);

// Upload
router.post(
  "/work-orders/:workOrderId/attachments",
  authorize(
    UserRole.OWNER,
    UserRole.DISPATCHER,
    UserRole.TECHNICIAN,
  ),
  upload.single("file"),
  uploadAttachmentController,
);

// List attachments
router.get(
  "/work-orders/:workOrderId/attachments",
  listAttachmentsController,
);

// Get attachment metadata
router.get(
  "/attachments/:id",
  getAttachmentController,
);

// Delete attachment
router.delete(
  "/attachments/:id",
  authorize(
    UserRole.OWNER,
    UserRole.DISPATCHER,
  ),
  deleteAttachmentController,
);

export default router;