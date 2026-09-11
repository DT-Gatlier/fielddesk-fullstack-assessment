import type pg from "pg";
import type { AllowedMimeType, WorkOrderAttachment } from "../types/attachment.js";

type AttachmentRow = {
  id: string;
  organisation_id: string;
  work_order_id: string;
  uploaded_by_user_id: string;
  storage_key: string;
  original_filename: string;
  mime_type: AllowedMimeType;
  size_bytes: string;
  created_at: Date;
};

function mapAttachment(row: AttachmentRow): WorkOrderAttachment {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    workOrderId: row.work_order_id,
    uploadedByUserId: row.uploaded_by_user_id,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at.toISOString(),
  };
}

export type OrganisationStorage = {
  id: string;
  storageLimitBytes: number;
  storageUsedBytes: number;
};

export async function lockOrganisationStorage(
  client: pg.PoolClient,
  organisationId: string,
): Promise<OrganisationStorage | null> {
  const result = await client.query<{
    id: string;
    storage_limit_bytes: string;
    storage_used_bytes: string;
  }>(
    `SELECT id, storage_limit_bytes, storage_used_bytes
     FROM organisations
     WHERE id = $1
     FOR UPDATE`,
    [organisationId],
  );

  if (!result.rowCount) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    storageLimitBytes: Number(row.storage_limit_bytes),
    storageUsedBytes: Number(row.storage_used_bytes),
  };
}

export async function insertAttachmentInTransaction(
  client: pg.PoolClient,
  input: {
    organisationId: string;
    workOrderId: string;
    uploadedByUserId: string;
    storageKey: string;
    originalFilename: string;
    mimeType: AllowedMimeType;
    sizeBytes: number;
  },
): Promise<WorkOrderAttachment> {
  const result = await client.query<AttachmentRow>(
    `INSERT INTO work_order_attachments (
       organisation_id, work_order_id, uploaded_by_user_id,
       storage_key, original_filename, mime_type, size_bytes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.organisationId,
      input.workOrderId,
      input.uploadedByUserId,
      input.storageKey,
      input.originalFilename,
      input.mimeType,
      input.sizeBytes,
    ],
  );

  await client.query(
    `UPDATE organisations
     SET storage_used_bytes = storage_used_bytes + $2
     WHERE id = $1`,
    [input.organisationId, input.sizeBytes],
  );

  return mapAttachment(result.rows[0]);
}

export async function findAttachmentByIdInOrg(
  pool: pg.Pool,
  attachmentId: string,
  organisationId: string,
): Promise<WorkOrderAttachment | null> {
  const result = await pool.query<AttachmentRow>(
    `SELECT * FROM work_order_attachments
     WHERE id = $1 AND organisation_id = $2`,
    [attachmentId, organisationId],
  );

  if (!result.rowCount) {
    return null;
  }

  return mapAttachment(result.rows[0]);
}

export async function listAttachmentsForWorkOrder(
  pool: pg.Pool,
  workOrderId: string,
  organisationId: string,
): Promise<WorkOrderAttachment[]> {
  const result = await pool.query<AttachmentRow>(
    `SELECT * FROM work_order_attachments
     WHERE work_order_id = $1 AND organisation_id = $2
     ORDER BY created_at DESC`,
    [workOrderId, organisationId],
  );

  return result.rows.map(mapAttachment);
}

export function toPublicAttachment(attachment: WorkOrderAttachment) {
  return {
    id: attachment.id,
    workOrderId: attachment.workOrderId,
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt,
  };
}
