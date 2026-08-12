import type { RequestHandler } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { conflict, notFound } from '../../common/errors.js';
import type { Database } from '../../database/pool.js';
import { getIdentity } from '../auth/auth.middleware.js';

export function listNotifications(database: Database): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity);
    const result = await database.query(`SELECT j.id, j.work_order_id AS "workOrderId", j.technician_id AS "technicianId", j.status, j.attempt_count AS "attemptCount", j.next_attempt_at AS "nextAttemptAt", j.last_error AS "lastError", j.delivered_at AS "deliveredAt", j.created_at AS "createdAt", COALESCE(json_agg(json_build_object('attemptNumber', a.attempt_number, 'outcome', a.outcome, 'errorMessage', a.error_message, 'createdAt', a.created_at) ORDER BY a.attempt_number) FILTER (WHERE a.id IS NOT NULL), '[]') AS attempts FROM notification_jobs j LEFT JOIN notification_attempts a ON a.job_id = j.id WHERE j.organisation_id = $1 GROUP BY j.id ORDER BY j.created_at DESC LIMIT 100`, [identity.organisationId]);
    response.json({ data: result.rows });
  });
}

export function retryNotification(database: Database): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity); const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await database.query(`UPDATE notification_jobs SET status = 'pending', next_attempt_at = now(), last_error = NULL, updated_at = now() WHERE organisation_id = $1 AND id = $2 AND status = 'permanent_failure' RETURNING id, status`, [identity.organisationId, id]);
    if (!result.rows[0]) {
      const exists = await database.query('SELECT status FROM notification_jobs WHERE organisation_id = $1 AND id = $2', [identity.organisationId, id]);
      if (!exists.rows[0]) throw notFound('Notification job not found');
      throw conflict('Only permanently failed notifications may be manually retried');
    }
    response.status(202).json({ data: result.rows[0] });
  });
}
