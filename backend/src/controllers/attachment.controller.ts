import { Request, Response, NextFunction } from 'express';
import { attachmentService } from '../services/attachment.service';
import { BadRequestError } from '../utils/errors';
import { logger } from '../utils/logger';

export const uploadAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const userId = req.user!.id;
    const workOrderId = req.params.workOrderId;
    const file = req.file;

    if (!file) {
      throw new BadRequestError('No file provided');
    }

    const attachment = await attachmentService.addAttachment(orgId, workOrderId, file, userId);
    
    logger.info({ attachmentId: attachment.id, reqId: req.correlationId }, 'Attachment uploaded successfully');
    res.status(201).json(attachment);
  } catch (error) {
    next(error);
  }
};

export const downloadAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const { workOrderId, id } = req.params;

    const { filePath, originalFilename, mimeType } = await attachmentService.getAttachmentFile(orgId, workOrderId, id);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalFilename)}"`);
    
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
};

export const deleteAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const userId = req.user!.id;
    const role = req.user!.role;
    const { workOrderId, id } = req.params;

    await attachmentService.deleteAttachment(orgId, workOrderId, id, userId, role);

    logger.info({ attachmentId: id, reqId: req.correlationId }, 'Attachment deleted successfully');
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
