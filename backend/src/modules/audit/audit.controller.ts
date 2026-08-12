import type { RequestHandler } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import type { Database } from '../../database/pool.js';
import { getIdentity } from '../auth/auth.middleware.js';

export function listAuditEntries(database: Database): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity);
    const query = z.object({ targetType: z.string().max(80).optional(), targetId: z.string().max(160).optional(), action: z.string().max(120).optional(), page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    const params: unknown[] = [identity.organisationId]; const where = ['a.organisation_id = $1'];
    for (const [column, value] of [['target_type', query.targetType], ['target_id', query.targetId], ['action', query.action]] as const) if (value) { params.push(value); where.push(`a.${column} = $${params.length}`); }
    const countParams = [...params]; params.push(query.limit, (query.page - 1) * query.limit);
    const [rows, count] = await Promise.all([
      database.query(`SELECT a.id, a.action, a.target_type AS "targetType", a.target_id AS "targetId", a.before_data AS "before", a.after_data AS "after", a.metadata, a.created_at AS "createdAt", u.id AS "actorUserId", u.name AS "actorName" FROM audit_entries a LEFT JOIN users u ON u.organisation_id = a.organisation_id AND u.id = a.actor_user_id WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
      database.query<{ count: string }>(`SELECT count(*) FROM audit_entries a WHERE ${where.join(' AND ')}`, countParams)
    ]);
    response.json({ data: rows.rows, meta: { page: query.page, limit: query.limit, total: Number(count.rows[0]?.count ?? 0) } });
  });
}
