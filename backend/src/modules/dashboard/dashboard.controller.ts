import type { RequestHandler } from 'express';
import { asyncHandler } from '../../common/async-handler.js';
import type { Database } from '../../database/pool.js';
import type { RuntimeServices } from '../../infrastructure/runtime.js';
import { getIdentity } from '../auth/auth.middleware.js';

export function getDashboard(database: Database, runtime: RuntimeServices): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity);
    const version = await runtime.getOrganisationCacheVersion(identity.organisationId);
    const key = `dashboard:${identity.organisationId}:${identity.role}:${identity.userId}:${version}`;
    const cached = await runtime.getCached<unknown>(key);
    if (cached) { response.setHeader('x-cache', 'HIT'); response.json({ data: cached }); return; }
    const params: unknown[] = [identity.organisationId];
    const scope = identity.role === 'technician' ? ' AND assigned_technician_id = $2' : '';
    if (scope) params.push(identity.userId);
    const [counts, priorities, upcoming, storage] = await Promise.all([
      database.query(`SELECT status, count(*)::int AS count FROM work_orders WHERE organisation_id = $1${scope} GROUP BY status`, params),
      database.query(`SELECT priority, count(*)::int AS count FROM work_orders WHERE organisation_id = $1${scope} AND status <> 'completed' AND status <> 'cancelled' GROUP BY priority`, params),
      database.query(`SELECT id, reference_number AS "referenceNumber", title, status, priority, scheduled_start AS "scheduledStart", scheduled_end AS "scheduledEnd", site_name AS "siteName" FROM work_orders WHERE organisation_id = $1${scope} AND scheduled_start >= now() AND status <> 'cancelled' ORDER BY scheduled_start LIMIT 10`, params),
      database.query(`SELECT storage_used_bytes AS "usedBytes", storage_limit_bytes AS "limitBytes" FROM organisations WHERE id = $1`, [identity.organisationId])
    ]);
    const data = {
      statusCounts: Object.fromEntries(counts.rows.map((row) => [row.status, row.count])),
      priorityCounts: Object.fromEntries(priorities.rows.map((row) => [row.priority, row.count])),
      upcoming: upcoming.rows, storage: storage.rows[0]
    };
    await runtime.setCached(key, data); response.setHeader('x-cache', 'MISS'); response.json({ data });
  });
}
