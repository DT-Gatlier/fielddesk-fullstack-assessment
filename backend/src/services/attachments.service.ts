import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type pg from "pg";
import { AppError } from "../lib/errors.js";
import {
  detectAllowedMimeType,
  extensionForMimeType,
  sanitiseOriginalFilename,
} from "../lib/file-validation.js";
import { insertAuditLog } from "../repositories/audit.repository.js";
import {
  findAttachmentByIdInOrg,
  insertAttachmentInTransaction,
  listAttachmentsForWorkOrder,
  lockOrganisationStorage,
  toPublicAttachment,
} from "../repositories/attachments.repository.js";
import { findWorkOrderByIdInOrg } from "../repositories/work-orders.repository.js";
import {
  canManageWorkOrders,
  canViewWorkOrder,
  toPublicWorkOrder,
} from "./work-orders.service.js";
import { publishWorkOrderEvent } from "./realtime.service.js";
import type { AuthContext } from "../types/auth.js";
import type { WorkOrderAttachment } from "../types/attachment.js";

function resolveAttachmentsRoot(attachmentsDir: string): string {
  return attachmentsDir.startsWith("/")
    ? attachmentsDir
    : resolve(process.cwd(), attachmentsDir);
}

export async function listAttachmentsForWorkOrderInOrg(
  pool: pg.Pool,
  auth: AuthContext,
  workOrderId: string,
) {
  const workOrder = await findWorkOrderByIdInOrg(pool, workOrderId, auth.organisationId);
  if (!workOrder || !canViewWorkOrder(auth, workOrder)) {
    throw new AppError("NOT_FOUND", "Work order not found", 404);
  }

  const attachments = await listAttachmentsForWorkOrder(
    pool,
    workOrderId,
    auth.organisationId,
  );
  return attachments.map(toPublicAttachment);
}

export async function uploadAttachmentForWorkOrder(
  pool: pg.Pool,
  auth: AuthContext,
  workOrderId: string,
  input: {
    originalFilename: string;
    buffer: Buffer;
    maxAttachmentBytes: number;
    attachmentsDir: string;
  },
): Promise<ReturnType<typeof toPublicAttachment>> {
  if (!canManageWorkOrders(auth.role)) {
    throw new AppError("FORBIDDEN", "Insufficient permissions", 403);
  }

  const workOrder = await findWorkOrderByIdInOrg(pool, workOrderId, auth.organisationId);
  if (!workOrder) {
    throw new AppError("NOT_FOUND", "Work order not found", 404);
  }

  if (input.buffer.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Uploaded file is empty", 400);
  }

  if (input.buffer.length > input.maxAttachmentBytes) {
    throw new AppError(
      "VALIDATION_ERROR",
      `File exceeds maximum size of ${input.maxAttachmentBytes} bytes`,
      400,
    );
  }

  const mimeType = detectAllowedMimeType(input.buffer);
  if (!mimeType) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only JPEG, PNG, and PDF files are allowed",
      400,
    );
  }

  const storageId = crypto.randomUUID();
  const storageKey = `${auth.organisationId}/${storageId}.${extensionForMimeType(mimeType)}`;
  const originalFilename = sanitiseOriginalFilename(input.originalFilename);
  const attachmentsRoot = resolveAttachmentsRoot(input.attachmentsDir);
  const absolutePath = join(attachmentsRoot, storageKey);

  const client = await pool.connect();
  let attachment: WorkOrderAttachment;

  try {
    await client.query("BEGIN");

    const orgStorage = await lockOrganisationStorage(client, auth.organisationId);
    if (!orgStorage) {
      throw new AppError("NOT_FOUND", "Organisation not found", 404);
    }

    if (orgStorage.storageUsedBytes + input.buffer.length > orgStorage.storageLimitBytes) {
      throw new AppError(
        "STORAGE_QUOTA_EXCEEDED",
        "Organisation storage quota exceeded",
        413,
      );
    }

    attachment = await insertAttachmentInTransaction(client, {
      organisationId: auth.organisationId,
      workOrderId,
      uploadedByUserId: auth.userId,
      storageKey,
      originalFilename,
      mimeType,
      sizeBytes: input.buffer.length,
    });

    await insertAuditLog(client, {
      organisationId: auth.organisationId,
      actorUserId: auth.userId,
      action: "work_order.attachment_uploaded",
      entityType: "work_order",
      entityId: workOrderId,
      metadata: {
        attachmentId: attachment.id,
        originalFilename,
        mimeType,
        sizeBytes: attachment.sizeBytes,
      },
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await mkdir(join(attachmentsRoot, auth.organisationId), { recursive: true });
  await writeFile(absolutePath, input.buffer);

  const refreshed = await findWorkOrderByIdInOrg(pool, workOrderId, auth.organisationId);
  if (refreshed) {
    publishWorkOrderEvent(
      auth.organisationId,
      "work_order.attachment_added",
      toPublicWorkOrder(refreshed) as unknown as Record<string, unknown>,
    );
  }

  return toPublicAttachment(attachment);
}

export async function getAttachmentDownload(
  pool: pg.Pool,
  auth: AuthContext,
  attachmentId: string,
  attachmentsDir: string,
): Promise<{ attachment: WorkOrderAttachment; absolutePath: string }> {
  const attachment = await findAttachmentByIdInOrg(
    pool,
    attachmentId,
    auth.organisationId,
  );
  if (!attachment) {
    throw new AppError("NOT_FOUND", "Attachment not found", 404);
  }

  const workOrder = await findWorkOrderByIdInOrg(
    pool,
    attachment.workOrderId,
    auth.organisationId,
  );
  if (!workOrder || !canViewWorkOrder(auth, workOrder)) {
    throw new AppError("NOT_FOUND", "Attachment not found", 404);
  }

  const attachmentsRoot = resolveAttachmentsRoot(attachmentsDir);
  const absolutePath = join(attachmentsRoot, attachment.storageKey);

  return { attachment, absolutePath };
}
