import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { writeAudit } from '../../../../shared/audit';
import { config } from '../../../../shared/config';
import { pool, withTransaction } from '../../../../shared/db';
import { publishRealtime } from '../../../../shared/realtime';
import type { AppDeps } from '../../deps';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import { authOf, requirePermission } from '../../middleware/auth';
import { parseParams, uuidParam } from '../../middleware/validate';
import { findInScope, lockInScope, scopeOf } from '../work-orders/repository';
import { sanitizeFilename, sniffContentType } from './storage';

export interface AttachmentRow {
  id: string; work_order_id: string; original_filename: string; content_type: string;
  size_bytes: number; uploaded_by: string; uploaded_by_name?: string | null; created_at: Date;
}

/** Public shape. The storage key and any filesystem location are deliberately omitted. */
export const toAttachment = (r: AttachmentRow) => ({
  id: r.id,
  workOrderId: r.work_order_id,
  filename: r.original_filename,
  contentType: r.content_type,
  sizeBytes: r.size_bytes,
  uploadedBy: { id: r.uploaded_by, name: r.uploaded_by_name ?? null },
  createdAt: r.created_at,
  downloadUrl: `/api/attachments/${r.id}/download`,
});

/** RFC 6266 Content-Disposition with an ASCII fallback and a UTF-8 filename*. */
function contentDisposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function attachmentsRouter(deps: AppDeps): { workOrderScoped: Router; byId: Router } {
  const upload = multer({
    storage: multer.diskStorage({
      destination: deps.storage.tempDir,
      filename: (_req, _file, cb) => cb(null, `upload-${randomUUID()}`), // never the client filename
    }),
    limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1, fields: 5, parts: 6 },
  });

  // Authorise BEFORE accepting the body, so callers who cannot see the work
  // order cannot make the server receive and buffer a file at all.
  const canSeeWorkOrder: RequestHandler = async (req, _res, next) => {
    const { id } = parseParams(req, uuidParam);
    if (!(await findInScope(pool, scopeOf(authOf(req)), id))) throw notFound('Work order');
    next();
  };

  const workOrderScoped = Router({ mergeParams: true });
  workOrderScoped.post(
    '/:id/attachments',
    requirePermission('attachments:upload'),
    canSeeWorkOrder,
    upload.single('file'),
    async (req, res) => {
      const auth = authOf(req);
      const { id: workOrderId } = parseParams(req, uuidParam);
      const file = req.file;
      if (!file) throw badRequest('A file is required in the "file" form field');
      try {
        const contentType = await sniffContentType(file.path);
        if (!contentType) {
          throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Only PNG, JPEG, WebP images and PDF documents are allowed');
        }
        const storageKey = `${auth.orgId}/${randomUUID()}`;
        const filename = sanitizeFilename(file.originalname);

        const row = await withTransaction(async (tx) => {
          const wo = await lockInScope(tx, scopeOf(auth), workOrderId);
          if (!wo) throw notFound('Work order');
          if (wo.status === 'cancelled') throw conflict('WORK_ORDER_CLOSED', 'Cannot attach files to a cancelled work order');

          // Atomic quota reservation: the row-level UPDATE only succeeds while
          // usage + size stays within the limit, so concurrent uploads cannot
          // overshoot it (the second waits on the row lock, then re-checks).
          const quota = await tx.query<{ storage_used_bytes: number; storage_limit_bytes: number }>(
            `UPDATE organisations SET storage_used_bytes = storage_used_bytes + $2
              WHERE id = $1 AND storage_used_bytes + $2 <= storage_limit_bytes
              RETURNING storage_used_bytes, storage_limit_bytes`,
            [auth.orgId, file.size],
          );
          if (!quota.rowCount) {
            const usage = (await tx.query('SELECT storage_used_bytes, storage_limit_bytes FROM organisations WHERE id = $1', [auth.orgId])).rows[0];
            throw new AppError(413, 'STORAGE_QUOTA_EXCEEDED', 'Your organisation has reached its storage limit', {
              usedBytes: usage.storage_used_bytes, limitBytes: usage.storage_limit_bytes, fileBytes: file.size,
            });
          }

          const { rows } = await tx.query<AttachmentRow>(
            `INSERT INTO attachments (org_id, work_order_id, uploaded_by, storage_key, original_filename, content_type, size_bytes)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [auth.orgId, workOrderId, auth.userId, storageKey, filename, contentType, file.size],
          );
          const att = rows[0]!;
          await writeAudit(tx, {
            orgId: auth.orgId, actorType: 'user', actorId: auth.userId, action: 'attachment.added',
            targetType: 'attachment', targetId: att.id, workOrderId,
            after: { filename, contentType, sizeBytes: file.size }, requestId: String(req.id),
          });
          // Move the file into place as the last step before COMMIT. If this
          // fails the transaction rolls back (quota and row released); if the
          // COMMIT itself fails the stored object is an orphan, not a dangling row.
          await deps.storage.put(storageKey, file.path);
          return { att, technicianId: wo.technician_id, reference: wo.reference };
        });

        await publishRealtime(deps.redis, {
          type: 'attachment.added', orgId: auth.orgId, workOrderId, reference: row.reference,
          technicianIds: row.technicianId ? [row.technicianId] : [],
        });
        res.status(201).json({ data: toAttachment({ ...row.att, uploaded_by_name: auth.name }) });
      } finally {
        await rm(file.path, { force: true }); // no-op once moved into storage
      }
    },
  );

  const byId = Router();
  byId.get('/:id/download', requirePermission('attachments:read'), async (req, res) => {
    const auth = authOf(req);
    const { id } = parseParams(req, uuidParam);
    // Join through the work order so technicians can only download files on work assigned to them.
    const { rows } = await pool.query<AttachmentRow & { storage_key: string }>(
      `SELECT a.* FROM attachments a JOIN work_orders w ON w.id = a.work_order_id AND w.org_id = a.org_id
        WHERE a.id = $1 AND a.org_id = $2 AND ($3::uuid IS NULL OR w.technician_id = $3)`,
      [id, auth.orgId, scopeOf(auth).technicianId],
    );
    const att = rows[0];
    if (!att) throw notFound('Attachment');
    const { stream, size } = await deps.storage.openRead(att.storage_key);
    res.setHeader('Content-Type', att.content_type);
    res.setHeader('Content-Length', String(size));
    res.setHeader('Content-Disposition', contentDisposition(att.original_filename));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    await pipeline(stream, res);
  });

  return { workOrderScoped, byId };
}
