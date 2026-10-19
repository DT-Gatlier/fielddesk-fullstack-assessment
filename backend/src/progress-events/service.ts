import { createHash } from 'node:crypto';
import { recordAudit, userActor } from '../audit/audit.js';
import type { AuthContext } from '../auth/sessions.js';
import { withOrg, type DbClient, type Pool } from '../db/pool.js';
import { Effects } from '../effects.js';
import { AppError, conflict, notFound } from '../http/errors.js';
import { realtimeEvent } from '../realtime/events.js';
import { canTransition, type Status, type WorkOrderRow } from '../work-orders/model.js';
import { loadWorkOrder } from '../work-orders/service.js';

export type ProgressEvent =
  | {
      eventId: string;
      workOrderId: string;
      type: 'status_changed';
      occurredAt: string;
      payload: { status: 'in_progress' | 'on_hold' | 'completed'; note?: string };
    }
  | { eventId: string; workOrderId: string; type: 'note_added'; occurredAt: string; payload: { note: string } };

export type EventOutcome = 'applied' | 'stale' | 'duplicate';

/** Fingerprint of everything that defines the event, to tell a genuine retry from a reused eventId. */
export function requestHash(event: ProgressEvent, submittedBy: string): string {
  const canonical = JSON.stringify({
    submittedBy,
    workOrderId: event.workOrderId,
    type: event.type,
    occurredAt: new Date(event.occurredAt).toISOString(),
    payload: event.payload,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

interface StoredEvent {
  outcome: 'applied' | 'stale';
  request_hash: string;
  work_order_id: string;
}

async function findEvent(client: DbClient, orgId: string, eventId: string): Promise<StoredEvent | undefined> {
  const { rows } = await client.query<StoredEvent>(
    'SELECT outcome, request_hash, work_order_id FROM progress_events WHERE org_id = $1 AND event_id = $2',
    [orgId, eventId],
  );
  return rows[0];
}

function replay(stored: StoredEvent, hash: string): void {
  if (stored.request_hash !== hash) {
    throw conflict('IDEMPOTENCY_KEY_REUSED', 'This eventId was already used for a different event.');
  }
}

/**
 * Processes one progress event in a single transaction:
 *
 *   1. lock the work order row (visible only if it is in the caller's organisation and assigned to them)
 *   2. return the original outcome if the eventId was already processed
 *   3. validate the change, insert the immutable event record, update the work order, write audit
 *
 * Any failure rolls back all of it, including the event record, so the client can safely retry.
 *
 * Concurrent duplicates: the unique (org_id, event_id) constraint is the arbiter. A second transaction
 * inserting the same eventId waits for the first; once it commits, ON CONFLICT DO NOTHING returns no
 * row, and the request is answered as a duplicate. Postgres provides this across all API instances.
 */
export async function submitProgressEvent(
  pool: Pool,
  auth: AuthContext,
  event: ProgressEvent,
  requestId: string,
): Promise<{ outcome: EventOutcome; row: WorkOrderRow; effects: Effects }> {
  const effects = new Effects();
  const hash = requestHash(event, auth.userId);

  return withOrg(pool, auth.orgId, async (client) => {
    const workOrder = await loadWorkOrder(client, auth, event.workOrderId, { lock: true });
    if (!workOrder) throw notFound('Work order');

    const existing = await findEvent(client, auth.orgId, event.eventId);
    if (existing) {
      replay(existing, hash);
      return { outcome: 'duplicate' as const, row: workOrder, effects };
    }

    let outcome: 'applied' | 'stale' = 'applied';
    let nextStatus: Status | undefined;
    if (event.type === 'status_changed') {
      // Events can arrive out of order (offline devices). A status event older than the last applied
      // one is recorded but must not roll the work order back.
      const latest = await client.query<{ latest: Date | null }>(
        `SELECT max(occurred_at) AS latest FROM progress_events
         WHERE org_id = $1 AND work_order_id = $2 AND type = 'status_changed' AND outcome = 'applied'`,
        [auth.orgId, workOrder.id],
      );
      const latestAt = latest.rows[0]?.latest;
      if (latestAt && latestAt.getTime() > Date.parse(event.occurredAt)) {
        outcome = 'stale';
      } else {
        nextStatus = event.payload.status;
        if (!canTransition(workOrder.status, nextStatus)) {
          throw new AppError(422, 'INVALID_TRANSITION', `Cannot change status from ${workOrder.status} to ${nextStatus}.`);
        }
      }
    }

    const inserted = await client.query(
      `INSERT INTO progress_events
         (org_id, event_id, work_order_id, submitted_by, type, occurred_at, payload, request_hash, outcome)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (org_id, event_id) DO NOTHING
       RETURNING id`,
      [auth.orgId, event.eventId, workOrder.id, auth.userId, event.type, event.occurredAt, JSON.stringify(event.payload), hash, outcome],
    );
    if (!inserted.rowCount) {
      // A concurrent request with the same eventId (for a different work order, so not serialised by
      // the row lock above) committed first.
      const winner = await findEvent(client, auth.orgId, event.eventId);
      replay(winner!, hash);
      return { outcome: 'duplicate' as const, row: workOrder, effects };
    }

    const audit = (action: string, before: unknown, after: unknown) =>
      recordAudit(client, {
        orgId: auth.orgId,
        actor: userActor(auth),
        action,
        targetType: 'work_order',
        targetId: workOrder.id,
        before,
        after,
        metadata: { eventId: event.eventId, occurredAt: event.occurredAt, source: 'progress_event' },
        requestId,
      });

    if (outcome === 'stale') {
      await audit('work_order.progress_event_stale', null, { status: nextStatus ?? null, ...event.payload });
      return { outcome, row: workOrder, effects };
    }

    let row = workOrder;
    if (nextStatus && nextStatus !== workOrder.status) {
      await client.query('UPDATE work_orders SET status = $3, version = version + 1 WHERE id = $1 AND org_id = $2', [
        workOrder.id,
        auth.orgId,
        nextStatus,
      ]);
      row = (await loadWorkOrder(client, auth, workOrder.id))!;
      await audit('work_order.status_changed', { status: workOrder.status }, { status: row.status, note: event.payload.note ?? null });
      effects.publish(auth.orgId, realtimeEvent('work_order.updated', row));
    } else if (event.payload.note) {
      await audit('work_order.note_added', null, { note: event.payload.note });
      effects.publish(auth.orgId, realtimeEvent('work_order.updated', row));
    }

    return { outcome, row, effects };
  });
}
