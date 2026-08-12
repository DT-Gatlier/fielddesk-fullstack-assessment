import type { RequestHandler } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { conflict, forbidden, notFound } from '../../common/errors.js';
import type { Database } from '../../database/pool.js';
import { inTransaction } from '../../database/pool.js';
import { getIdentity } from '../auth/auth.middleware.js';
import type { RuntimeServices } from '../../infrastructure/runtime.js';

const eventSchema = z.object({
  eventId: z.string().trim().min(1).max(128),
  workOrderId: z.string().uuid(),
  type: z.literal('status_changed'),
  occurredAt: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
  payload: z.object({
    status: z.enum(['in_progress', 'completed']),
    note: z.string().trim().max(2000).optional()
  }).strict()
}).strict().refine((value) => value.occurredAt.getTime() <= Date.now() + 5 * 60_000, { path: ['occurredAt'], message: 'occurredAt cannot be more than five minutes in the future' });

function ensureSameEvent(existing: { work_order_id: string; accepted_request: { type?: string; occurredAt?: string; payload?: { status?: string; note?: string } } }, input: z.infer<typeof eventSchema>) {
  const accepted = existing.accepted_request;
  if (existing.work_order_id !== input.workOrderId || accepted.type !== input.type || accepted.occurredAt !== input.occurredAt.toISOString() || accepted.payload?.status !== input.payload.status || accepted.payload?.note !== input.payload.note) {
    throw conflict('eventId was already used for a different event');
  }
}

export function submitProgressEvent(database: Database, runtime: RuntimeServices): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity);
    const input = eventSchema.parse(request.body);
    const result = await inTransaction(database, async (client) => {
      const existing = await client.query(`SELECT work_order_id, accepted_request FROM progress_events WHERE organisation_id = $1 AND event_id = $2`, [identity.organisationId, input.eventId]);
      if (existing.rows[0]) { ensureSameEvent(existing.rows[0], input); return { duplicate: true, eventId: input.eventId, workOrderId: existing.rows[0].work_order_id }; }

      const workOrder = await client.query(`SELECT id, status, assigned_technician_id FROM work_orders WHERE organisation_id = $1 AND id = $2 FOR UPDATE`, [identity.organisationId, input.workOrderId]);
      const row = workOrder.rows[0];
      if (!row) throw notFound('Work order not found');
      if (identity.role !== 'technician' || row.assigned_technician_id !== identity.userId) throw forbidden('Only the assigned technician may submit progress');
      if (row.status === 'cancelled') throw conflict('A cancelled work order cannot receive progress');
      if (row.status === 'completed' && input.payload.status !== 'completed') throw conflict('A completed work order cannot return to an active status');

      const accepted = { ...request.body, occurredAt: input.occurredAt.toISOString() };
      const inserted = await client.query(`INSERT INTO progress_events (organisation_id, event_id, work_order_id, submitted_by_id, type, occurred_at, payload, accepted_request) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (organisation_id, event_id) DO NOTHING RETURNING id`, [identity.organisationId, input.eventId, input.workOrderId, identity.userId, input.type, input.occurredAt, input.payload, accepted]);
      if (!inserted.rowCount) {
        const winner = await client.query(`SELECT work_order_id, accepted_request FROM progress_events WHERE organisation_id = $1 AND event_id = $2`, [identity.organisationId, input.eventId]);
        ensureSameEvent(winner.rows[0], input);
        return { duplicate: true, eventId: input.eventId, workOrderId: winner.rows[0].work_order_id };
      }

      await client.query(`UPDATE work_orders SET status = $3, updated_at = now() WHERE organisation_id = $1 AND id = $2`, [identity.organisationId, input.workOrderId, input.payload.status]);
      await client.query(`INSERT INTO audit_entries (organisation_id, actor_user_id, action, target_type, target_id, before_data, after_data, metadata) VALUES ($1, $2, 'work_order.status_changed', 'work_order', $3, $4, $5, $6)`, [identity.organisationId, identity.userId, input.workOrderId, { status: row.status }, { status: input.payload.status }, { eventId: input.eventId, note: input.payload.note }]);
      return { duplicate: false, eventId: input.eventId, workOrderId: input.workOrderId, status: input.payload.status };
    });
    if (!result.duplicate) await runtime.publish(identity.organisationId, 'work_order.progress', result);
    response.status(result.duplicate ? 200 : 201).json({ data: result });
  });
}
