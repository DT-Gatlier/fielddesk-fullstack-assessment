import { createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recordAudit, userActor } from '../audit/audit.js';
import { authenticate, authOf } from '../auth/guards.js';
import { withOrg } from '../db/pool.js';
import { Effects } from '../effects.js';
import { AppError, notFound, validationError } from '../http/errors.js';
import { parse } from '../http/validation.js';
import { realtimeEvent } from '../realtime/events.js';
import { loadWorkOrder } from '../work-orders/service.js';
import { toAttachment } from './model.js';
import { detectContentType, SNIFF_BYTES, type AllowedContentType } from './file-type.js';

const idParams = z.object({ id: z.string().uuid() });

const unsupportedType = () =>
  new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Only PNG, JPEG, WebP images and PDF documents are accepted.');

/** The original name is only ever displayed or sent in Content-Disposition, never used as a path. */
export function sanitizeFilename(name: string | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim().slice(0, 255);
  return cleaned || 'file';
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/[\\"]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Passes bytes through while hashing, counting and checking the leading magic bytes. */
function inspector() {
  const hash = createHash('sha256');
  const state = { size: 0, contentType: null as AllowedContentType | null, head: Buffer.alloc(0) };
  const check = () => {
    state.contentType = detectContentType(state.head);
    return state.contentType ? null : unsupportedType();
  };
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (!state.contentType && state.head.length < SNIFF_BYTES) {
        state.head = Buffer.concat([state.head, chunk]).subarray(0, SNIFF_BYTES);
        if (state.head.length >= SNIFF_BYTES) {
          const error = check();
          if (error) return callback(error);
        }
      }
      hash.update(chunk);
      state.size += chunk.length;
      callback(null, chunk);
    },
    flush(callback) {
      if (!state.contentType) return callback(check());
      callback();
    },
  });
  return { stream, state, digest: () => hash.digest('hex') };
}

export async function attachmentRoutes(app: FastifyInstance): Promise<void> {
  // Owners and dispatchers may attach to any work order in their organisation; technicians only to
  // work assigned to them (enforced by loadWorkOrder).
  app.post('/api/work-orders/:id/attachments', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    const { id: workOrderId } = parse(idParams, request.params);

    const visible = await withOrg(app.pg, auth.orgId, (client) => loadWorkOrder(client, auth, workOrderId));
    if (!visible) throw notFound('Work order');
    if (!request.isMultipart()) {
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Expected a multipart/form-data upload.');
    }

    const part = await request.file({ limits: { fileSize: app.config.MAX_ATTACHMENT_BYTES, files: 1, fields: 0 } });
    if (!part || part.fieldname !== 'file') throw validationError([{ path: 'file', message: 'Upload one file in the "file" field.' }]);

    const filename = sanitizeFilename(part.filename);
    const storageKey = `${auth.orgId}/${randomUUID()}`;
    const inspect = inspector();

    try {
      await app.storage.write(storageKey, part.file, inspect.stream);
      if (part.file.truncated) throw new Error('truncated');
    } catch (error) {
      await app.storage.remove(storageKey);
      if (part.file.truncated || (error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new AppError(413, 'FILE_TOO_LARGE', `Files must be at most ${app.config.MAX_ATTACHMENT_BYTES} bytes.`);
      }
      throw error;
    }
    if (inspect.state.size === 0) {
      await app.storage.remove(storageKey);
      throw validationError([{ path: 'file', message: 'The file is empty.' }]);
    }

    const effects = new Effects();
    try {
      const row = await withOrg(app.pg, auth.orgId, async (client) => {
        // Atomic quota check and reservation. Concurrent uploads queue on the organisation row, and
        // the WHERE clause is re-evaluated against the latest committed total, so the limit holds.
        const quota = await client.query(
          `UPDATE organisations SET storage_used_bytes = storage_used_bytes + $2
           WHERE id = $1 AND storage_used_bytes + $2 <= storage_limit_bytes
           RETURNING storage_used_bytes`,
          [auth.orgId, inspect.state.size],
        );
        if (!quota.rowCount) {
          throw new AppError(413, 'STORAGE_QUOTA_EXCEEDED', 'Your organisation has reached its storage limit.');
        }

        const workOrder = await loadWorkOrder(client, auth, workOrderId);
        if (!workOrder) throw notFound('Work order');

        const inserted = await client.query<{ id: string; created_at: Date }>(
          `INSERT INTO attachments (org_id, work_order_id, uploaded_by, storage_key, original_filename, content_type, size_bytes, sha256)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, created_at`,
          [auth.orgId, workOrderId, auth.userId, storageKey, filename, inspect.state.contentType, inspect.state.size, inspect.digest()],
        );
        const attachment = inserted.rows[0]!;

        await recordAudit(client, {
          orgId: auth.orgId,
          actor: userActor(auth),
          action: 'attachment.added',
          targetType: 'work_order',
          targetId: workOrderId,
          after: { attachmentId: attachment.id, filename, contentType: inspect.state.contentType, sizeBytes: inspect.state.size },
          requestId: request.id,
        });
        effects.publish(auth.orgId, realtimeEvent('attachment.added', workOrder));

        return {
          id: attachment.id,
          original_filename: filename,
          content_type: inspect.state.contentType!,
          size_bytes: inspect.state.size,
          uploaded_by: auth.userId,
          uploaded_by_name: auth.name,
          created_at: attachment.created_at,
        };
      });

      await effects.dispatch({ queue: app.notificationQueue, redis: app.redis, log: request.log });
      request.log.info({ attachmentId: row.id, sizeBytes: row.size_bytes }, 'attachment stored');
      return reply.status(201).send({ data: toAttachment(row) });
    } catch (error) {
      // Nothing was committed, so the stored bytes are orphaned; remove them.
      await app.storage.remove(storageKey);
      throw error;
    }
  });

  app.get('/api/attachments/:id/download', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    const { id } = parse(idParams, request.params);

    const attachment = await withOrg(app.pg, auth.orgId, async (client) => {
      const { rows } = await client.query<{ storage_key: string; original_filename: string; content_type: string; size_bytes: number }>(
        `SELECT a.storage_key, a.original_filename, a.content_type, a.size_bytes
         FROM attachments a
         JOIN work_orders wo ON wo.id = a.work_order_id AND wo.org_id = a.org_id
         WHERE a.id = $1 AND a.org_id = $2 AND ($3::uuid IS NULL OR wo.assigned_technician_id = $3)`,
        [id, auth.orgId, auth.role === 'technician' ? auth.userId : null],
      );
      return rows[0];
    });
    if (!attachment) throw notFound('Attachment');

    const stream = await app.storage.read(attachment.storage_key);
    if (!stream) {
      request.log.error({ attachmentId: id }, 'attachment metadata exists but stored object is missing');
      throw notFound('Attachment');
    }

    return reply
      .header('content-type', attachment.content_type)
      .header('content-length', attachment.size_bytes)
      .header('content-disposition', contentDisposition(attachment.original_filename))
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('cache-control', 'private, no-store')
      .send(stream);
  });
}
