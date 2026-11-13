import { Request, Response, NextFunction } from "express";
import { AttachmentService } from "./attachment.service";

const attachmentService = new AttachmentService();

export class AttachmentController {
  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      const auth = req.auth!;
      const file = req.file;

      if (!file) {
        res.status(400).json({ success: false, message: "No file uploaded" });
        return;
      }

      const attachment = await attachmentService.uploadAttachment(
        String(req.params.workOrderId),
        auth.organisationId,
        auth.userId,
        auth.role,
        {
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          buffer: file.buffer,
        }
      );

      res.status(201).json({
        success: true,
        message: "Attachment uploaded successfully",
        attachment,
      });
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const auth = req.auth!;
      const attachments = await attachmentService.listAttachments(
        String(req.params.workOrderId),
        auth.organisationId,
        auth.role,
        auth.userId
      );

      res.status(200).json({
        success: true,
        attachments,
      });
    } catch (error) {
      next(error);
    }
  }

  async download(req: Request, res: Response, next: NextFunction) {
    try {
      const auth = req.auth!;
      const fileData = await attachmentService.getAttachmentFile(
        String(req.params.workOrderId),
        String(req.params.attachmentId),
        auth.organisationId,
        auth.role,
        auth.userId
      );

      res.setHeader("Content-Type", fileData.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(fileData.fileName)}"`
      );
      res.sendFile(fileData.filePath);
    } catch (error) {
      next(error);
    }
  }
}

