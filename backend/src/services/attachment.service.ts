import { v4 as uuidv4 } from 'uuid';
import { TenantContext } from '../domain/models/tenant-context.js';
import { attachmentRepository } from '../repositories/attachment.repository.js';
import { workOrderRepository } from '../repositories/work-order.repository.js';
import { storageAdapter } from '../infrastructure/storage/index.js';
import { query } from '../infrastructure/db.js';
import {
  NotFoundError,
  ForbiddenError,
  QuotaExceededError,
} from '../domain/errors/index.js';
import { Attachment, StorageQuotaInfo } from '../domain/models/attachment.model.js';
import { SupportedMimeType, getExtensionForMime } from '../api/middlewares/file-validator.js';
import { Readable } from 'stream';
import { publishRealtimeEvent } from '../realtime/realtime.publisher.js';

export async function uploadAttachment(
  ctx: TenantContext,
  workOrderId: string,
  file: Express.Multer.File,
  validatedMimeType: SupportedMimeType,
  sanitizedFilename: string
): Promise<Attachment> {
  // 1. Verify work order exists and belongs to organisation (anti-enumeration: 404)
  const workOrder = await workOrderRepository.findById(workOrderId, ctx.organisationId);
  if (!workOrder) {
    throw new NotFoundError(`Work order ${workOrderId} not found.`);
  }

  // 2. Authorize role: Technicians can only attach files to work orders assigned to them
  if (ctx.role === 'technician' && workOrder.assignedTechnicianId !== ctx.userId) {
    throw new ForbiddenError(
      'Technicians can only upload attachments to work orders currently assigned to them.'
    );
  }

  // 3. Storage Quota Enforcement
  const quotaBytes = await attachmentRepository.getStorageQuota(ctx.organisationId);
  const currentUsage = await attachmentRepository.getCurrentUsage(ctx.organisationId);

  if (currentUsage + file.size > quotaBytes) {
    throw new QuotaExceededError(
      `Organisation storage quota of ${quotaBytes} bytes exceeded. Current usage: ${currentUsage} bytes, incoming file: ${file.size} bytes.`
    );
  }

  // 4. Safe storage key (UUID + extension) - local paths are never returned
  const extension = getExtensionForMime(validatedMimeType);
  const storageKey = `${uuidv4()}${extension}`;

  // 5. Save file to disk in uploads/{orgId}/{storageKey}
  await storageAdapter.saveFile(ctx.organisationId, storageKey, file.buffer);

  // 6. Insert attachment record in PostgreSQL
  const attachmentId = uuidv4();
  const attachment = await attachmentRepository.create({
    id: attachmentId,
    organisationId: ctx.organisationId,
    workOrderId,
    originalFilename: sanitizedFilename,
    storageKey,
    mimeType: validatedMimeType,
    fileSizeBytes: file.size,
    uploadedBy: ctx.userId,
  });

  // 7. Record immutable audit log
  await query(
    `INSERT INTO audit_logs (
      organisation_id, actor_id, action, target_type, target_id, before_state, after_state, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      ctx.organisationId,
      ctx.userId,
      'ATTACHMENT_UPLOADED',
      'work_order',
      workOrderId,
      null,
      null,
      JSON.stringify({
        attachmentId: attachment.id,
        originalFilename: attachment.originalFilename,
        fileSizeBytes: attachment.fileSizeBytes,
        mimeType: attachment.mimeType,
      }),
    ]
  );

  void publishRealtimeEvent(ctx.organisationId, 'work_order_updated', {
    type: 'WORK_ORDER_UPDATED',
    workOrderId,
    timestamp: new Date().toISOString(),
  });

  return attachment;
}

export async function getAttachmentStream(
  ctx: TenantContext,
  attachmentId: string
): Promise<{ attachment: Attachment; stream: Readable }> {
  // 1. Find attachment with tenant scoping (404 anti-enumeration for other tenants)
  const attachment = await attachmentRepository.findById(attachmentId, ctx.organisationId);
  if (!attachment) {
    throw new NotFoundError(`Attachment ${attachmentId} not found.`);
  }

  // 2. Fetch file stream
  const stream = await storageAdapter.getFileStream(
    ctx.organisationId,
    attachment.storageKey
  );

  return { attachment, stream };
}

export async function getOrganisationQuota(ctx: TenantContext): Promise<StorageQuotaInfo> {
  return await attachmentRepository.getQuotaInfo(ctx.organisationId);
}

export async function listWorkOrderAttachments(
  ctx: TenantContext,
  workOrderId: string
): Promise<Attachment[]> {
  // Check work order exists in organisation
  const workOrder = await workOrderRepository.findById(workOrderId, ctx.organisationId);
  if (!workOrder) {
    throw new NotFoundError(`Work order ${workOrderId} not found.`);
  }

  // If technician, verify assigned
  if (ctx.role === 'technician' && workOrder.assignedTechnicianId !== ctx.userId) {
    throw new ForbiddenError(
      'Technicians can only view attachments for work orders assigned to them.'
    );
  }

  return await attachmentRepository.findByWorkOrderId(workOrderId, ctx.organisationId);
}

export async function deleteAttachment(ctx: TenantContext, attachmentId: string): Promise<Attachment> {
  const attachment = await attachmentRepository.findById(attachmentId, ctx.organisationId);
  if (!attachment) {
    throw new NotFoundError(`Attachment ${attachmentId} not found.`);
  }

  // Technicians can only delete attachments they uploaded themselves
  if (ctx.role === 'technician' && attachment.uploadedBy !== ctx.userId) {
    throw new ForbiddenError('Technicians can only delete attachments uploaded by themselves.');
  }

  // Remove file from disk
  await storageAdapter.deleteFile(ctx.organisationId, attachment.storageKey);

  // Delete record from DB
  const deleted = await attachmentRepository.delete(attachmentId, ctx.organisationId);

  // Audit log
  await query(
    `INSERT INTO audit_logs (
      organisation_id, actor_id, action, target_type, target_id, before_state, after_state, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      ctx.organisationId,
      ctx.userId,
      'ATTACHMENT_DELETED',
      'work_order',
      attachment.workOrderId,
      null,
      null,
      JSON.stringify({
        attachmentId: attachment.id,
        originalFilename: attachment.originalFilename,
      }),
    ]
  );

  void publishRealtimeEvent(ctx.organisationId, 'work_order_updated', {
    type: 'WORK_ORDER_UPDATED',
    workOrderId: attachment.workOrderId,
    timestamp: new Date().toISOString(),
  });

  return deleted!;
}

// Grouped object export to seamlessly support existing callers without `this`
export const attachmentService = {
  uploadAttachment,
  getAttachmentStream,
  getOrganisationQuota,
  listWorkOrderAttachments,
  deleteAttachment,
};
