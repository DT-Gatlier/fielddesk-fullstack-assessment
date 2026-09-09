import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config.js";
import { getPool } from "../db/pool.js";
import { AppError } from "../lib/errors.js";
import { authenticate } from "../middleware/auth.js";
import {
  getAttachmentDownload,
  listAttachmentsForWorkOrderInOrg,
  uploadAttachmentForWorkOrder,
} from "../services/attachments.service.js";

export async function registerAttachmentRoutes(
  app: FastifyInstance,
  config: Env,
): Promise<void> {
  const pool = getPool(config);

  app.get(
    "/api/v1/work-orders/:workOrderId/attachments",
    { preHandler: [authenticate] },
    async (request) => {
      const { workOrderId } = request.params as { workOrderId: string };
      const attachments = await listAttachmentsForWorkOrderInOrg(
        pool,
        request.auth,
        workOrderId,
      );
      return { attachments };
    },
  );

  app.post(
    "/api/v1/work-orders/:workOrderId/attachments",
    { preHandler: [authenticate] },
    async (request) => {
      const { workOrderId } = request.params as { workOrderId: string };
      const file = await request.file();

      if (!file) {
        throw new AppError("VALIDATION_ERROR", "Expected a file upload", 400);
      }

      const buffer = await file.toBuffer();
      const attachment = await uploadAttachmentForWorkOrder(
        pool,
        request.auth,
        workOrderId,
        {
          originalFilename: file.filename,
          buffer,
          maxAttachmentBytes: config.MAX_ATTACHMENT_BYTES,
          attachmentsDir: config.ATTACHMENTS_DIR,
        },
      );

      return { attachment };
    },
  );

  app.get(
    "/api/v1/attachments/:attachmentId/download",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { attachmentId } = request.params as { attachmentId: string };
      const { attachment, absolutePath } = await getAttachmentDownload(
        pool,
        request.auth,
        attachmentId,
        config.ATTACHMENTS_DIR,
      );

      try {
        await access(absolutePath);
      } catch {
        throw new AppError("NOT_FOUND", "Attachment file not found", 404);
      }

      return reply
        .header("Content-Type", attachment.mimeType)
        .header(
          "Content-Disposition",
          `attachment; filename="${attachment.originalFilename.replace(/"/g, "")}"`,
        )
        .send(createReadStream(absolutePath));
    },
  );
}
