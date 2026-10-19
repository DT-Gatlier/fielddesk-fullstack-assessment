import { recordAudit, userActor } from '../audit/audit.js';
import type { AuthContext } from '../auth/sessions.js';
import { withOrg, type DbClient, type Pool } from '../db/pool.js';
import { Effects } from '../effects.js';
import { AppError, conflict, notFound } from '../http/errors.js';
import { realtimeEvent } from '../realtime/events.js';
import {
  auditFields,
  canTransition,
  WORK_ORDER_COLUMNS,
  WORK_ORDER_FROM,
  type Priority,
  type Status,
  type WorkOrderRow,
} from './model.js';

export interface CreateWorkOrderInput {
  title: string;
  description: string;
  priority: Priority;
  siteName: string;
  assignedTechnicianId: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
}

export interface UpdateWorkOrderInput {
  version: number;
  title?: string;
  description?: string;
  priority?: Priority;
  siteName?: string;
  status?: Status;
  assignedTechnicianId?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
}

/**
 * Loads one work order the caller may see: same organisation and, for technicians, assigned to them.
 * Anything else is indistinguishable from a missing id.
 */
export async function loadWorkOrder(
  client: DbClient,
  auth: AuthContext,
  id: string,
  options: { lock?: boolean } = {},
): Promise<WorkOrderRow | null> {
  const technicianScope = auth.role === 'technician' ? 'AND wo.assigned_technician_id = $3' : '';
  const params = auth.role === 'technician' ? [id, auth.orgId, auth.userId] : [id, auth.orgId];
  const { rows } = await client.query<WorkOrderRow>(
    `SELECT ${WORK_ORDER_COLUMNS} ${WORK_ORDER_FROM}
     WHERE wo.id = $1 AND wo.org_id = $2 ${technicianScope}
     ${options.lock ? 'FOR NO KEY UPDATE OF wo' : ''}`,
    params,
  );
  return rows[0] ?? null;
}

async function assertTechnician(client: DbClient, orgId: string, technicianId: string): Promise<void> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM users WHERE id = $1 AND org_id = $2 AND role = 'technician' AND is_active`,
    [technicianId, orgId],
  );
  if (!rowCount) {
    throw new AppError(422, 'INVALID_TECHNICIAN', 'The assigned technician does not exist or is not an active technician.');
  }
}

async function createNotification(client: DbClient, row: WorkOrderRow, effects: Effects): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO notifications (org_id, work_order_id, technician_id, dedupe_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, dedupe_key) DO NOTHING
     RETURNING id`,
    [row.org_id, row.id, row.assigned_technician_id, `${row.id}:${row.assigned_technician_id}:v${row.version}`],
  );
  if (rows[0]) effects.notify({ notificationId: rows[0].id, orgId: row.org_id });
}

function isOverlapViolation(error: unknown): boolean {
  const pgError = error as { code?: string; constraint?: string };
  return pgError?.code === '23P01' && pgError.constraint === 'work_orders_no_technician_overlap';
}

/** Turns an exclusion-constraint violation into a 409 that names the conflicting work orders. */
async function scheduleConflict(
  pool: Pool,
  auth: AuthContext,
  technicianId: string,
  start: string,
  end: string,
  excludeId: string | null,
): Promise<AppError> {
  const conflicts = await withOrg(pool, auth.orgId, async (client) => {
    const { rows } = await client.query<{ id: string; reference: string; scheduled_start: Date; scheduled_end: Date }>(
      `SELECT id, reference, scheduled_start, scheduled_end FROM work_orders
       WHERE org_id = $1 AND assigned_technician_id = $2 AND status <> 'cancelled'
         AND tstzrange(scheduled_start, scheduled_end, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')
         AND ($5::uuid IS NULL OR id <> $5)
       ORDER BY scheduled_start LIMIT 5`,
      [auth.orgId, technicianId, start, end, excludeId],
    );
    return rows;
  });
  return conflict(
    'SCHEDULE_CONFLICT',
    'The technician is already assigned to an overlapping work order.',
    conflicts.map((row) => ({
      path: 'scheduledStart',
      message: `Overlaps ${row.reference} (${row.scheduled_start.toISOString()} – ${row.scheduled_end.toISOString()})`,
    })),
  );
}

export async function createWorkOrder(
  pool: Pool,
  auth: AuthContext,
  input: CreateWorkOrderInput,
  requestId: string,
): Promise<{ row: WorkOrderRow; effects: Effects }> {
  const effects = new Effects();
  try {
    const row = await withOrg(pool, auth.orgId, async (client) => {
      if (input.assignedTechnicianId) await assertTechnician(client, auth.orgId, input.assignedTechnicianId);

      // Per-organisation reference counter. The row lock serialises creates within one organisation only.
      const seq = await client.query<{ work_order_seq: number }>(
        'UPDATE organisations SET work_order_seq = work_order_seq + 1 WHERE id = $1 RETURNING work_order_seq',
        [auth.orgId],
      );
      const reference = `WO-${String(seq.rows[0]!.work_order_seq).padStart(6, '0')}`;
      const status: Status = input.assignedTechnicianId && input.scheduledStart ? 'scheduled' : 'open';

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO work_orders
           (org_id, reference, title, description, priority, status, site_name,
            assigned_technician_id, scheduled_start, scheduled_end, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          auth.orgId,
          reference,
          input.title,
          input.description,
          input.priority,
          status,
          input.siteName,
          input.assignedTechnicianId,
          input.scheduledStart,
          input.scheduledEnd,
          auth.userId,
        ],
      );
      const row = (await loadWorkOrder(client, auth, inserted.rows[0]!.id))!;

      await recordAudit(client, {
        orgId: auth.orgId,
        actor: userActor(auth),
        action: 'work_order.created',
        targetType: 'work_order',
        targetId: row.id,
        after: { ...auditFields(row), status: row.status, reference: row.reference },
        requestId,
      });

      if (row.assigned_technician_id) {
        await recordAudit(client, {
          orgId: auth.orgId,
          actor: userActor(auth),
          action: 'work_order.assigned',
          targetType: 'work_order',
          targetId: row.id,
          before: { technicianId: null },
          after: { technicianId: row.assigned_technician_id, technicianName: row.technician_name },
          requestId,
        });
        await createNotification(client, row, effects);
      }

      effects.publish(auth.orgId, realtimeEvent('work_order.created', row));
      return row;
    });
    return { row, effects };
  } catch (error) {
    if (isOverlapViolation(error) && input.assignedTechnicianId && input.scheduledStart && input.scheduledEnd) {
      throw await scheduleConflict(pool, auth, input.assignedTechnicianId, input.scheduledStart, input.scheduledEnd, null);
    }
    throw error;
  }
}

export async function updateWorkOrder(
  pool: Pool,
  auth: AuthContext,
  id: string,
  input: UpdateWorkOrderInput,
  requestId: string,
): Promise<{ row: WorkOrderRow; effects: Effects }> {
  const effects = new Effects();
  let attempted: { technicianId: string | null; start: string | null; end: string | null } | undefined;

  try {
    const row = await withOrg(pool, auth.orgId, async (client) => {
      const before = await loadWorkOrder(client, auth, id, { lock: true });
      if (!before) throw notFound('Work order');

      // Optimistic concurrency: reject edits based on a stale copy instead of silently overwriting.
      if (before.version !== input.version) {
        throw conflict('VERSION_CONFLICT', 'This work order was changed by someone else. Reload it and try again.');
      }
      if (before.status === 'completed') {
        throw new AppError(422, 'WORK_ORDER_CLOSED', 'Completed work orders cannot be edited.');
      }

      const technicianId = input.assignedTechnicianId !== undefined ? input.assignedTechnicianId : before.assigned_technician_id;
      const scheduleGiven = input.scheduledStart !== undefined;
      const start = scheduleGiven ? input.scheduledStart! : (before.scheduled_start?.toISOString() ?? null);
      const end = scheduleGiven ? input.scheduledEnd! : (before.scheduled_end?.toISOString() ?? null);
      attempted = { technicianId, start, end };

      const technicianChanged = technicianId !== before.assigned_technician_id;
      if (technicianChanged && technicianId) await assertTechnician(client, auth.orgId, technicianId);

      let status = input.status ?? before.status;
      if (!input.status && before.status === 'open' && technicianId && start) status = 'scheduled';
      if (!canTransition(before.status, status)) {
        throw new AppError(422, 'INVALID_TRANSITION', `Cannot change status from ${before.status} to ${status}.`);
      }

      await client.query(
        `UPDATE work_orders SET
           title = $3, description = $4, priority = $5, site_name = $6, status = $7,
           assigned_technician_id = $8, scheduled_start = $9, scheduled_end = $10, version = version + 1
         WHERE id = $1 AND org_id = $2`,
        [
          id,
          auth.orgId,
          input.title ?? before.title,
          input.description ?? before.description,
          input.priority ?? before.priority,
          input.siteName ?? before.site_name,
          status,
          technicianId,
          start,
          end,
        ],
      );
      const after = (await loadWorkOrder(client, auth, id))!;
      const audit = (action: string, beforeValue: unknown, afterValue: unknown) =>
        recordAudit(client, {
          orgId: auth.orgId,
          actor: userActor(auth),
          action,
          targetType: 'work_order',
          targetId: id,
          before: beforeValue,
          after: afterValue,
          requestId,
        });

      const fieldsBefore = auditFields(before);
      const fieldsAfter = auditFields(after);
      const changed = (Object.keys(fieldsAfter) as Array<keyof typeof fieldsAfter>).filter(
        (key) => fieldsBefore[key] !== fieldsAfter[key],
      );
      if (changed.length) {
        await audit(
          'work_order.updated',
          Object.fromEntries(changed.map((key) => [key, fieldsBefore[key]])),
          Object.fromEntries(changed.map((key) => [key, fieldsAfter[key]])),
        );
      }
      if (technicianChanged) {
        await audit(
          after.assigned_technician_id ? 'work_order.assigned' : 'work_order.unassigned',
          { technicianId: before.assigned_technician_id, technicianName: before.technician_name },
          { technicianId: after.assigned_technician_id, technicianName: after.technician_name },
        );
      }
      if (before.status !== after.status) {
        await audit('work_order.status_changed', { status: before.status }, { status: after.status });
      }

      const scheduleChanged = changed.includes('scheduledStart') || changed.includes('scheduledEnd');
      if (after.assigned_technician_id && after.status !== 'cancelled' && (technicianChanged || scheduleChanged)) {
        await createNotification(client, after, effects);
      }

      effects.publish(auth.orgId, realtimeEvent('work_order.updated', after, before.assigned_technician_id));
      return after;
    });
    return { row, effects };
  } catch (error) {
    if (isOverlapViolation(error) && attempted?.technicianId && attempted.start && attempted.end) {
      throw await scheduleConflict(pool, auth, attempted.technicianId, attempted.start, attempted.end, id);
    }
    throw error;
  }
}
