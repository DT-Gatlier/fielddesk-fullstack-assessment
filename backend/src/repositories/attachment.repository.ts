import { query } from '../infrastructure/db.js';
import { Attachment, StorageQuotaInfo } from '../domain/models/attachment.model.js';

export class AttachmentRepository {
  async getStorageQuota(orgId: string): Promise<number> {
    const res = await query<{ storage_quota_bytes: string | number }>(
      `SELECT storage_quota_bytes FROM organisations WHERE id = $1`,
      [orgId]
    );
    if (!res.rows.length) {
      return 524288000; // Default 500 MB
    }
    return Number(res.rows[0].storage_quota_bytes) || 524288000;
  }

  async getCurrentUsage(orgId: string): Promise<number> {
    const res = await query<{ current_usage: string | number }>(
      `SELECT COALESCE(SUM(file_size_bytes), 0) AS current_usage FROM attachments WHERE organisation_id = $1`,
      [orgId]
    );
    return Number(res.rows[0]?.current_usage) || 0;
  }

  async getQuotaInfo(orgId: string): Promise<StorageQuotaInfo> {
    const [quotaBytes, usedBytes] = await Promise.all([
      this.getStorageQuota(orgId),
      this.getCurrentUsage(orgId),
    ]);

    const percentUsed = quotaBytes > 0 ? Number(((usedBytes / quotaBytes) * 100).toFixed(2)) : 0;

    return {
      usedBytes,
      quotaBytes,
      percentUsed,
    };
  }

  async create(data: {
    id: string;
    organisationId: string;
    workOrderId: string;
    originalFilename: string;
    storageKey: string;
    mimeType: string;
    fileSizeBytes: number;
    uploadedBy: string;
  }): Promise<Attachment> {
    const text = `
      INSERT INTO attachments (
        id, organisation_id, work_order_id, original_filename,
        storage_key, mime_type, file_size_bytes, uploaded_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `;
    const params = [
      data.id,
      data.organisationId,
      data.workOrderId,
      data.originalFilename,
      data.storageKey,
      data.mimeType,
      data.fileSizeBytes,
      data.uploadedBy,
    ];

    const res = await query<any>(text, params);
    const row = res.rows[0];

    return {
      id: row.id,
      organisationId: row.organisation_id,
      workOrderId: row.work_order_id,
      originalFilename: row.original_filename,
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      fileSizeBytes: Number(row.file_size_bytes),
      uploadedBy: row.uploaded_by,
      downloadUrl: `/api/v1/attachments/${row.id}/download`,
      createdAt: row.created_at,
    };
  }

  async findById(id: string, orgId: string): Promise<Attachment | null> {
    const res = await query<any>(
      `SELECT * FROM attachments WHERE id = $1 AND organisation_id = $2`,
      [id, orgId]
    );
    if (!res.rows.length) return null;

    const row = res.rows[0];
    return {
      id: row.id,
      organisationId: row.organisation_id,
      workOrderId: row.work_order_id,
      originalFilename: row.original_filename,
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      fileSizeBytes: Number(row.file_size_bytes),
      uploadedBy: row.uploaded_by,
      downloadUrl: `/api/v1/attachments/${row.id}/download`,
      createdAt: row.created_at,
    };
  }

  async findByWorkOrderId(workOrderId: string, orgId: string): Promise<Attachment[]> {
    const res = await query<any>(
      `SELECT * FROM attachments WHERE work_order_id = $1 AND organisation_id = $2 ORDER BY created_at DESC`,
      [workOrderId, orgId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      organisationId: row.organisation_id,
      workOrderId: row.work_order_id,
      originalFilename: row.original_filename,
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      fileSizeBytes: Number(row.file_size_bytes),
      uploadedBy: row.uploaded_by,
      downloadUrl: `/api/v1/attachments/${row.id}/download`,
      createdAt: row.created_at,
    }));
  }

  async delete(id: string, orgId: string): Promise<Attachment | null> {
    const res = await query<any>(
      `DELETE FROM attachments WHERE id = $1 AND organisation_id = $2 RETURNING *`,
      [id, orgId]
    );
    if (!res.rows.length) return null;

    const row = res.rows[0];
    return {
      id: row.id,
      organisationId: row.organisation_id,
      workOrderId: row.work_order_id,
      originalFilename: row.original_filename,
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      fileSizeBytes: Number(row.file_size_bytes),
      uploadedBy: row.uploaded_by,
      downloadUrl: `/api/v1/attachments/${row.id}/download`,
      createdAt: row.created_at,
    };
  }
}

export const attachmentRepository = new AttachmentRepository();

