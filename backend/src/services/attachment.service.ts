import { prisma } from '../utils/db';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { sseManager } from '../utils/sseManager';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const unlinkAsync = promisify(fs.unlink);

export class AttachmentService {
  async addAttachment(orgId: string, workOrderId: string, file: Express.Multer.File, uploaderId: string) {
    // Verify work order access
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
    });

    if (!workOrder || workOrder.orgId !== orgId) {
      // Clean up the uploaded file since we're rejecting it
      await this.cleanupFile(file.path);
      throw new NotFoundError('Work order not found');
    }

    const fileSize = BigInt(file.size);

    try {
      // Use transaction to ensure storage quota check and record creation are atomic
      return await prisma.$transaction(async (tx) => {
        // Atomic quota increment
        // We use a raw query because Prisma doesn't have native check constraints on updates
        const updateResult = await tx.$executeRaw`
          UPDATE "storage_usage" 
          SET "usedBytes" = "usedBytes" + ${fileSize}
          WHERE "orgId" = ${orgId}::uuid 
          AND "usedBytes" + ${fileSize} <= (
            SELECT "storageLimitBytes" FROM "organisations" WHERE "id" = ${orgId}::uuid
          )
        `;

        if (updateResult === 0) {
          throw new ConflictError('Storage quota exceeded');
        }

        // Create attachment record
        const attachment = await tx.attachment.create({
          data: {
            workOrderId,
            orgId,
            originalFilename: file.originalname, // We only store this for display, not for fs access
            storageKey: file.filename, // Safe uuid-based name
            mimeType: file.mimetype,
            sizeBytes: fileSize,
            uploadedBy: uploaderId,
          },
        });

        // Add audit log
        await tx.auditLog.create({
          data: {
            orgId,
            actorId: uploaderId,
            action: 'ATTACHMENT_ADDED',
            targetType: 'WORK_ORDER',
            targetId: workOrderId,
            metadata: {
              attachmentId: attachment.id,
              filename: file.originalname,
              sizeBytes: file.size,
            },
          },
        });

        // Broadcast to clients
        sseManager.broadcast(orgId, 'work_order_updated', { id: workOrderId });

        return {
          ...attachment,
          sizeBytes: Number(attachment.sizeBytes), // Convert BigInt for JSON serialization
        };
      });
    } catch (error) {
      // Clean up file if transaction failed
      await this.cleanupFile(file.path);
      throw error;
    }
  }

  async getAttachmentFile(orgId: string, workOrderId: string, attachmentId: string) {
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment || attachment.orgId !== orgId || attachment.workOrderId !== workOrderId) {
      throw new NotFoundError('Attachment not found');
    }

    const filePath = path.join(UPLOAD_DIR, attachment.storageKey);
    
    // Prevent directory traversal attacks
    if (!filePath.startsWith(UPLOAD_DIR)) {
      throw new NotFoundError('Attachment not found');
    }

    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('Attachment file missing from storage');
    }

    return {
      filePath,
      originalFilename: attachment.originalFilename,
      mimeType: attachment.mimeType,
    };
  }

  async deleteAttachment(orgId: string, workOrderId: string, attachmentId: string, actorId: string, role: string) {
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment || attachment.orgId !== orgId || attachment.workOrderId !== workOrderId) {
      throw new NotFoundError('Attachment not found');
    }

    if (role !== 'OWNER' && attachment.uploadedBy !== actorId) {
      throw new ForbiddenError('Not authorized to delete this attachment');
    }

    const fileSize = attachment.sizeBytes;
    const filePath = path.join(UPLOAD_DIR, attachment.storageKey);

    await prisma.$transaction(async (tx) => {
      // Delete from DB
      await tx.attachment.delete({
        where: { id: attachmentId },
      });

      // Free up storage quota
      await tx.$executeRaw`
        UPDATE "storage_usage" 
        SET "usedBytes" = "usedBytes" - ${fileSize}
        WHERE "orgId" = ${orgId}::uuid
      `;

      // Log deletion
      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          action: 'ATTACHMENT_REMOVED',
          targetType: 'WORK_ORDER',
          targetId: workOrderId,
          metadata: {
            attachmentId: attachment.id,
            filename: attachment.originalFilename,
          },
        },
      });
      
      // Broadcast to clients
      sseManager.broadcast(orgId, 'work_order_updated', { id: workOrderId });
    });

    // Clean up file physically
    await this.cleanupFile(filePath);
  }
  
  private async cleanupFile(filePath: string) {
    try {
      if (fs.existsSync(filePath)) {
        await unlinkAsync(filePath);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

export const attachmentService = new AttachmentService();
