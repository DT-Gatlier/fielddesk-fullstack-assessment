import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { writeAudit } from '../../../../shared/audit';
import { config } from '../../../../shared/config';
import { pool, withTransaction } from '../../../../shared/db';
import type { AppDeps } from '../../deps';
import { AppError, conflict, notFound } from '../../lib/errors';
import { failpoint } from '../../lib/failpoints';
import { authOf, requirePermission } from '../../middleware/auth';
import { eventLimiter } from '../../middleware/rate-limit';
import { parseBody } from '../../middleware/validate';
import { lockInScope, scopeOf } from '../work-orders/repository';
import { applyStatusChange, publishWorkOrderEvent } from '../work-orders/service';
import { TECHNICIAN_SETTABLE, type Status } from '../work-orders/status';

const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const EARLIEST = Date.parse('2000-01-01T00:00:00Z');

const occurredAt = z
  .string()
  .datetime({ offset: true, message: 'must be an ISO-8601 timestamp with timezone' })
  .transform((s) => new Date(s))
  .refine((d) => d.getTime() <= Date.now() + MAX_CLOCK_SKEW_MS, 'cannot be in the future')
  .refine((d) => d.getTime() >= EARLIEST, 'is unrealistically old');

const common = {
  eventId: z.string().regex(/^[A-Za-z0-9._:-]{1,100}$/, 'must be 1-100 characters of A-Z a-z 0-9 . _ : -'),
  workOrderId: z.string().uuid(),
  occurredAt,
};

/** The whole request is untrusted: strict objects reject unknown fields at every level. */
export const progressEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...common,
    type: z.literal('status_changed'),
    payload: z.object({
      status: z.enum(TECHNICIAN_SETTABLE as [Status, ...Status[]]),
      note: z.string().trim().max(1000).optional(),
    }).strict(),
  }).strict(),
  z.object({
    ...common,
    type: z.literal('note_added'),
    payload: z.object({ note: z.string().trim().min(1).max(1000) }).strict(),
  }).strict(),
]);
type ProgressEvent = z.infer<typeof progressEventSchema>;

/** Deterministic JSON (sorted keys) so equal requests always hash equally. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function requestHash(actorId: string, e: ProgressEvent) {
  return createHash('sha256')
    .update(canonical({ actorId, workOrderId: e.workOrderId, type: e.type, occurredAt: e.occurredAt.toISOString(), payload: e.payload }))
    .digest('hex');
}

interface StoredEvent { request_hash: string; result: EventResult }
interface EventResult {
  eventId: string; workOrderId: string; type: string; workOrderStatus: Status; workOrderVersion: number; acceptedAt: string;
}

class DuplicateRace extends Error {}

async function findExisting(orgId: string, eventId: string) {
  const { rows } = await pool.query<StoredEvent>(
    'SELECT request_hash, result FROM progress_events WHERE org_id = $1 AND event_id = $2',
    [orgId, eventId],
  );
  return rows[0];
}

function replayOrReject(existing: StoredEvent, hash: string) {
  if (existing.request_hash !== hash) {
    throw conflict('EVENT_ID_REUSED', 'This eventId was already used for a different event');
  }
  return existing.result;
}

export function eventsRouter(deps: AppDeps): Router {
  const router = Router();

  /**
   * Idempotency mechanism (see TECHNICAL_NOTES.md):
   *  1. Fast path: an eventId already stored -> replay the stored result (200)
   *     if the request is identical, 409 EVENT_ID_REUSED if it differs.
   *  2. Otherwise ONE transaction: lock the work order row (only if assigned to
   *     the caller) -> re-check the eventId under that lock -> apply the change
   *     -> insert the immutable event (UNIQUE org_id+event_id) -> audit -> COMMIT.
   *  Concurrent duplicates queue on the work-order row lock; the second one
   *  then sees the committed event and replays it. The unique constraint is the
   *  final backstop: losing that race rolls back every change made so far.
   */
  router.post(
    '/',
    requirePermission('events:submit'),
    eventLimiter(deps.redis, config.RATE_LIMIT_EVENTS_MAX, config.RATE_LIMIT_EVENTS_WINDOW_SEC),
    async (req, res) => {
      const auth = authOf(req);
      const event = parseBody(req, progressEventSchema);
      const hash = requestHash(auth.userId, event);

      const existing = await findExisting(auth.orgId, event.eventId);
      if (existing) {
        res.status(200).json({ data: { ...replayOrReject(existing, hash), duplicate: true } });
        return;
      }

      let outcome: { result: EventResult; replayed: boolean; technicianId: string | null; reference: string; status: Status; orgId: string };
      try {
        outcome = await withTransaction(async (tx) => {
          // Authorisation: only the technician currently assigned can act on the work order.
          const wo = await lockInScope(tx, scopeOf(auth), event.workOrderId);
          if (!wo) throw notFound('Work order');

          const already = await tx.query<StoredEvent>(
            'SELECT request_hash, result FROM progress_events WHERE org_id = $1 AND event_id = $2',
            [auth.orgId, event.eventId],
          );
          if (already.rows[0]) {
            return { result: replayOrReject(already.rows[0], hash), replayed: true, technicianId: wo.technician_id, reference: wo.reference, status: wo.status, orgId: wo.org_id };
          }

          if (wo.status === 'completed' || wo.status === 'cancelled') {
            throw conflict('WORK_ORDER_CLOSED', `Work order is ${wo.status}`);
          }

          let updated = wo;
          if (event.type === 'status_changed') {
            updated = await applyStatusChange(tx, { auth, requestId: String(req.id) }, wo, event.payload.status, {
              note: event.payload.note, source: 'progress_event', eventId: event.eventId,
            });
          }

          failpoint('progress_event.after_update'); // test hook: proves rollback of the update above

          const result: EventResult = {
            eventId: event.eventId,
            workOrderId: wo.id,
            type: event.type,
            workOrderStatus: updated.status,
            workOrderVersion: updated.version,
            acceptedAt: new Date().toISOString(),
          };
          const inserted = await tx.query(
            `INSERT INTO progress_events (org_id, event_id, work_order_id, actor_id, type, occurred_at, payload, request_hash, result)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (org_id, event_id) DO NOTHING RETURNING id`,
            [auth.orgId, event.eventId, wo.id, auth.userId, event.type, event.occurredAt, JSON.stringify(event.payload), hash, JSON.stringify(result)],
          );
          if (!inserted.rowCount) throw new DuplicateRace();

          await writeAudit(tx, {
            orgId: auth.orgId, actorType: 'user', actorId: auth.userId, action: 'progress_event.accepted',
            targetType: 'work_order', targetId: wo.id, workOrderId: wo.id,
            after: { type: event.type, payload: event.payload, occurredAt: event.occurredAt },
            metadata: { eventId: event.eventId }, requestId: String(req.id),
          });
          return { result, replayed: false, technicianId: updated.technician_id, reference: updated.reference, status: updated.status, orgId: updated.org_id };
        });
      } catch (err) {
        if (err instanceof DuplicateRace) {
          // Everything in our transaction was rolled back; return the winner's stored result.
          const winner = await findExisting(auth.orgId, event.eventId);
          if (!winner) throw new AppError(503, 'BUSY_RETRY', 'Please retry');
          res.status(200).json({ data: { ...replayOrReject(winner, hash), duplicate: true } });
          return;
        }
        throw err;
      }

      if (outcome.replayed) {
        res.status(200).json({ data: { ...outcome.result, duplicate: true } });
        return;
      }
      await publishWorkOrderEvent(
        { auth, requestId: String(req.id), redis: deps.redis },
        event.type === 'status_changed' ? 'work_order.status_changed' : 'work_order.updated',
        { id: event.workOrderId, org_id: outcome.orgId, reference: outcome.reference, status: outcome.status },
        [outcome.technicianId],
      );
      res.status(201).json({ data: { ...outcome.result, duplicate: false } });
    },
  );

  return router;
}
