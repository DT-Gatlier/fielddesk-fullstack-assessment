import { Request, Response, NextFunction } from 'express';
import { attachmentService } from '../../services/attachment.service.js';
import { SupportedMimeType } from '../middlewares/file-validator.js';

export class AttachmentController {
  async uploadAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantContext = req.tenantContext!;
      const workOrderId = req.params.id;
      const file = req.file!;
      const validatedMimeType = (req as any).validatedMimeType as SupportedMimeType;
      const sanitizedFilename = (req as any).sanitizedFilename as string;

      const attachment = await attachmentService.uploadAttachment(
        tenantContext,
        workOrderId,
        file,
        validatedMimeType,
        sanitizedFilename
      );

      res.status(201).json({
        id: attachment.id,
        workOrderId: attachment.workOrderId,
        originalFilename: attachment.originalFilename,
        mimeType: attachment.mimeType,
        fileSizeBytes: attachment.fileSizeBytes,
        downloadUrl: attachment.downloadUrl,
        createdAt: attachment.createdAt,
      });
    } catch (err) {
      next(err);
    }
  }

  async downloadAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantContext = req.tenantContext!;
      const attachmentId = req.params.id;

      const { attachment, stream } = await attachmentService.getAttachmentStream(tenantContext, attachmentId);

      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(attachment.originalFilename)}"`
      );
      res.setHeader('Content-Length', attachment.fileSizeBytes);

      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  async getQuota(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantContext = req.tenantContext!;
      const quota = await attachmentService.getOrganisationQuota(tenantContext);

      res.status(200).json({
        usedBytes: quota.usedBytes,
        quotaBytes: quota.quotaBytes,
        percentUsed: quota.percentUsed,
      });
    } catch (err) {
      next(err);
    }
  }

  async listWorkOrderAttachments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantContext = req.tenantContext!;
      const workOrderId = req.params.id;

      const attachments = await attachmentService.listWorkOrderAttachments(tenantContext, workOrderId);
      res.status(200).json({ attachments });
    } catch (err) {
      next(err);
    }
  }

  async deleteAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantContext = req.tenantContext!;
      const attachmentId = req.params.id;

      const deleted = await attachmentService.deleteAttachment(tenantContext, attachmentId);
      res.status(200).json({
        message: 'Attachment deleted successfully',
        attachment: deleted,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const attachmentController = new AttachmentController();

