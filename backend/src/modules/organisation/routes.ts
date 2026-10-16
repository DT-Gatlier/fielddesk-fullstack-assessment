import { Router } from 'express';
import { z } from 'zod';
import { writeAudit } from '../../../../shared/audit';
import { pool, withTransaction } from '../../../../shared/db';
import { authOf, requirePermission } from '../../middleware/auth';
import { parseBody, parseQuery } from '../../middleware/validate';

interface OrgRow {
  id: string; name: string; slug: string; storage_limit_bytes: number; storage_used_bytes: number;
}
const toOrg = (r: OrgRow) => ({
  id: r.id, name: r.name, slug: r.slug,
  storage: { limitBytes: r.storage_limit_bytes, usedBytes: r.storage_used_bytes },
});

const updateSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();

const auditQuery = z.object({
  action: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export function organisationRouter(): Router {
  const router = Router();

  // The organisation is always the caller's own; there is no :id to tamper with.
  router.get('/', requirePermission('org:read'), async (req, res) => {
    const { rows } = await pool.query<OrgRow>(
      'SELECT id, name, slug, storage_limit_bytes, storage_used_bytes FROM organisations WHERE id = $1',
      [authOf(req).orgId],
    );
    res.json({ data: toOrg(rows[0]!) });
  });

  router.patch('/', requirePermission('org:manage'), async (req, res) => {
    const auth = authOf(req);
    const body = parseBody(req, updateSchema);
    const org = await withTransaction(async (tx) => {
      const before = (await tx.query<OrgRow>('SELECT * FROM organisations WHERE id = $1 FOR UPDATE', [auth.orgId])).rows[0]!;
      const { rows } = await tx.query<OrgRow>(
        'UPDATE organisations SET name = $2 WHERE id = $1 RETURNING id, name, slug, storage_limit_bytes, storage_used_bytes',
        [auth.orgId, body.name],
      );
      await writeAudit(tx, {
        orgId: auth.orgId, actorType: 'user', actorId: auth.userId, action: 'organisation.updated',
        targetType: 'organisation', targetId: auth.orgId, before: { name: before.name }, after: { name: body.name },
        requestId: String(req.id),
      });
      return rows[0]!;
    });
    res.json({ data: toOrg(org) });
  });

  // Organisation-wide audit trail (read-only; there is no write endpoint for audit entries).
  router.get('/audit-log', requirePermission('audit:read'), async (req, res) => {
    const auth = authOf(req);
    const q = parseQuery(req, auditQuery);
    const { rows } = await pool.query(
      `SELECT a.id, a.actor_type, a.actor_id, u.name AS actor_name, a.action, a.target_type, a.target_id,
              a.work_order_id, a.before, a.after, a.metadata, a.request_id, a.created_at,
              count(*) OVER () AS total
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.org_id = $1 AND ($2::text IS NULL OR a.action = $2)
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $3 OFFSET $4`,
      [auth.orgId, q.action ?? null, q.pageSize, (q.page - 1) * q.pageSize],
    );
    res.json({
      data: rows.map(toAuditEntry),
      meta: { page: q.page, pageSize: q.pageSize, total: Number(rows[0]?.total ?? 0) },
    });
  });

  return router;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toAuditEntry(r: any) {
  return {
    id: String(r.id),
    actor: { type: r.actor_type, id: r.actor_id, name: r.actor_name ?? (r.actor_type === 'system' ? 'System' : null) },
    action: r.action,
    target: { type: r.target_type, id: r.target_id },
    workOrderId: r.work_order_id,
    before: r.before,
    after: r.after,
    metadata: r.metadata,
    requestId: r.request_id,
    createdAt: r.created_at,
  };
}
