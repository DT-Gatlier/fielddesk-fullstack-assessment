import type { Redis } from 'ioredis';
import { writeAudit } from '../../../../shared/audit';
import { pool, withTransaction, type Tx } from '../../../../shared/db';
import { publishRealtime, type RealtimeEventType } from '../../../../shared/realtime';
import { AppError, conflict, notFound } from '../../lib/errors';
import type { AuthContext } from '../../types';
import { insertAssignmentNotification } from '../notifications/outbox';
import { findInScope, lockInScope, scopeOf, toWorkOrder, type WorkOrderRow } from './repository';
import { canTransition, CLOSED_STATUSES, type Priority, type Status } from './status';

export interface ServiceCtx {
  auth: AuthContext;
  requestId: string;
  redis: Redis;
}

/** The fields captured in audit before/after snapshots. */
function snapshot(r: WorkOrderRow) {
  return {
    reference: r.reference,
    title: r.title,
    description: r.description,
    priority: r.priority,
    status: r.status,
    siteName: r.site_name,
    technicianId: r.technician_id,
    scheduledStart: r.scheduled_start,
    scheduledEnd: r.scheduled_end,
  };
}

function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}

const scheduleConflict = (details?: unknown) =>
  conflict('SCHEDULE_CONFLICT', 'The technician already has an overlapping assignment in this time window', details);

const MAX_DEADLOCK_RETRIES = 3;

/**
 * The exclusion constraint is the real guarantee. If two transactions race
 * past the friendly pre-check, PostgreSQL makes the second one wait for the
 * first and then fail with 23P01; this maps that failure to the same 409.
 *
 * When both transactions write their conflicting rows before either checks,
 * each waits on the other and PostgreSQL aborts one with a deadlock (40P01).
 * The victim was fully rolled back, so `fn` (which opens a fresh transaction)
 * is retried; the retry then sees the winner and fails with a proper 409.
 */
async function mapScheduleRace<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === '23P01') {
        throw scheduleConflict({ reason: 'A concurrent assignment for this technician was committed first' });
      }
      if (code === '40P01' && attempt < MAX_DEADLOCK_RETRIES) continue;
      throw err;
    }
  }
}

function assertVersion(row: WorkOrderRow, expected: number | undefined) {
  if (expected !== undefined && expected !== row.version) {
    throw conflict('VERSION_CONFLICT', 'This work order was changed by someone else. Reload and try again.', {
      currentVersion: row.version,
    });
  }
}

function assertOpen(row: WorkOrderRow) {
  if (CLOSED_STATUSES.includes(row.status)) {
    throw conflict('WORK_ORDER_CLOSED', `Work order is ${row.status} and can no longer be changed`);
  }
}

/** The technician must be an active technician of the SAME organisation (FOR SHARE blocks concurrent deactivation). */
async function loadTechnician(tx: Tx, orgId: string, technicianId: string) {
  const { rows } = await tx.query<{ id: string; email: string; name: string }>(
    `SELECT id, email, name FROM users
      WHERE id = $1 AND org_id = $2 AND role = 'technician' AND is_active
      FOR SHARE`,
    [technicianId, orgId],
  );
  if (!rows[0]) {
    throw new AppError(400, 'INVALID_TECHNICIAN', 'technicianId must refer to an active technician in your organisation');
  }
  return rows[0];
}

/** Friendly pre-check that names the clashing work order. Not relied on for correctness. */
async function assertNoOverlap(
  tx: Tx, orgId: string, technicianId: string, start: Date, end: Date, excludeId: string | null,
) {
  const { rows } = await tx.query<{ id: string; reference: string; scheduled_start: Date; scheduled_end: Date }>(
    `SELECT id, reference, scheduled_start, scheduled_end FROM work_orders
      WHERE org_id = $1 AND technician_id = $2
        AND status NOT IN ('completed','cancelled')
        AND tstzrange(scheduled_start, scheduled_end, '[)') && tstzrange($3, $4, '[)')
        AND ($5::uuid IS NULL OR id <> $5)
      LIMIT 1`,
    [orgId, technicianId, start, end, excludeId],
  );
  const c = rows[0];
  if (c) {
    throw scheduleConflict({
      conflictingWorkOrder: { id: c.id, reference: c.reference, scheduledStart: c.scheduled_start, scheduledEnd: c.scheduled_end },
    });
  }
}

async function publish(
  ctx: ServiceCtx,
  type: RealtimeEventType,
  row: Pick<WorkOrderRow, 'id' | 'org_id' | 'reference' | 'status'>,
  technicianIds: (string | null)[],
) {
  await publishRealtime(ctx.redis, {
    type,
    orgId: row.org_id,
    workOrderId: row.id,
    reference: row.reference,
    status: row.status,
    technicianIds: [...new Set(technicianIds.filter((t): t is string => Boolean(t)))],
  });
}

async function reload(ctx: ServiceCtx, id: string) {
  // Reload with the dispatcher-level org scope: the caller was already authorised for this row.
  const row = await findInScope(pool, { orgId: ctx.auth.orgId, technicianId: null }, id);
  if (!row) throw notFound('Work order');
  return toWorkOrder(row);
}

// ---------------------------------------------------------------------------

export interface CreateInput {
  title: string; description: string; priority: Priority; siteName: string;
  technicianId?: string | null; scheduledStart?: Date | null; scheduledEnd?: Date | null;
}

export async function createWorkOrder(ctx: ServiceCtx, input: CreateInput) {
  const { orgId, userId } = ctx.auth;
  const row = await mapScheduleRace(() =>
    withTransaction(async (tx) => {
      // Per-organisation reference numbers (WO-00001, ...) without gaps between orgs.
      const seq = await tx.query<{ work_order_seq: number }>(
        'UPDATE organisations SET work_order_seq = work_order_seq + 1 WHERE id = $1 RETURNING work_order_seq',
        [orgId],
      );
      const reference = `WO-${String(seq.rows[0]!.work_order_seq).padStart(5, '0')}`;

      const tech = input.technicianId ? await loadTechnician(tx, orgId, input.technicianId) : null;
      if (tech) await assertNoOverlap(tx, orgId, tech.id, input.scheduledStart!, input.scheduledEnd!, null);

      const { rows } = await tx.query<WorkOrderRow>(
        `INSERT INTO work_orders (org_id, reference, title, description, priority, site_name,
           technician_id, scheduled_start, scheduled_end, assignment_version, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [orgId, reference, input.title, input.description, input.priority, input.siteName,
          tech?.id ?? null, input.scheduledStart ?? null, input.scheduledEnd ?? null, tech ? 1 : 0, userId],
      );
      const wo = rows[0]!;
      await writeAudit(tx, {
        orgId, actorType: 'user', actorId: userId, action: 'work_order.created',
        targetType: 'work_order', targetId: wo.id, workOrderId: wo.id, after: snapshot(wo), requestId: ctx.requestId,
      });
      if (tech) {
        await writeAudit(tx, {
          orgId, actorType: 'user', actorId: userId, action: 'work_order.assignment_changed',
          targetType: 'work_order', targetId: wo.id, workOrderId: wo.id,
          before: { technicianId: null, scheduledStart: null, scheduledEnd: null },
          after: { technicianId: tech.id, scheduledStart: wo.scheduled_start, scheduledEnd: wo.scheduled_end },
          requestId: ctx.requestId,
        });
        await insertAssignmentNotification(tx, {
          id: wo.id, orgId, reference, title: wo.title, siteName: wo.site_name,
          scheduledStart: wo.scheduled_start!, scheduledEnd: wo.scheduled_end!, assignmentVersion: wo.assignment_version,
        }, tech, ctx.requestId);
      }
      return wo;
    }),
  );
  await publish(ctx, 'work_order.created', row, [row.technician_id]);
  return reload(ctx, row.id);
}

export interface UpdateInput {
  title?: string; description?: string; priority?: Priority; siteName?: string; version?: number;
}

export async function updateWorkOrder(ctx: ServiceCtx, id: string, input: UpdateInput) {
  const { orgId, userId } = ctx.auth;
  const result = await withTransaction(async (tx) => {
    const current = await lockInScope(tx, scopeOf(ctx.auth), id);
    if (!current) throw notFound('Work order');
    assertVersion(current, input.version);
    assertOpen(current);
    const { rows } = await tx.query<WorkOrderRow>(
      `UPDATE work_orders SET
         title = COALESCE($3, title), description = COALESCE($4, description),
         priority = COALESCE($5, priority), site_name = COALESCE($6, site_name), version = version + 1
       WHERE id = $1 AND org_id = $2 RETURNING *`,
      [id, orgId, input.title ?? null, input.description ?? null, input.priority ?? null, input.siteName ?? null],
    );
    const updated = rows[0]!;
    const d = diff(snapshot(current), snapshot(updated));
    if (d.changed) {
      await writeAudit(tx, {
        orgId, actorType: 'user', actorId: userId, action: 'work_order.updated',
        targetType: 'work_order', targetId: id, workOrderId: id, before: d.before, after: d.after, requestId: ctx.requestId,
      });
    }
    return updated;
  });
  await publish(ctx, 'work_order.updated', result, [result.technician_id]);
  return reload(ctx, id);
}

export interface AssignmentInput {
  technicianId: string | null; scheduledStart: Date | null; scheduledEnd: Date | null; version?: number;
}

/**
 * Assign / reassign / unassign a technician and set the schedule, atomically.
 * Transaction: lock the work order row -> validate technician (same org,
 * active) -> friendly overlap pre-check -> UPDATE (exclusion constraint is
 * the real guard) -> audit entry -> outbox notification -> COMMIT.
 */
export async function assignWorkOrder(ctx: ServiceCtx, id: string, input: AssignmentInput) {
  const { orgId, userId } = ctx.auth;
  const { before, after } = await mapScheduleRace(() =>
    withTransaction(async (tx) => {
      const current = await lockInScope(tx, scopeOf(ctx.auth), id);
      if (!current) throw notFound('Work order');
      assertVersion(current, input.version);
      assertOpen(current);
      if (!input.technicianId && current.status === 'in_progress') {
        throw conflict('INVALID_TRANSITION', 'A work order in progress cannot be left without a technician');
      }

      const tech = input.technicianId ? await loadTechnician(tx, orgId, input.technicianId) : null;
      if (tech) await assertNoOverlap(tx, orgId, tech.id, input.scheduledStart!, input.scheduledEnd!, id);

      const technicianChanged = (tech?.id ?? null) !== current.technician_id;
      const { rows } = await tx.query<WorkOrderRow>(
        `UPDATE work_orders SET technician_id = $3, scheduled_start = $4, scheduled_end = $5,
           assignment_version = assignment_version + $6, version = version + 1
         WHERE id = $1 AND org_id = $2 RETURNING *`,
        [id, orgId, tech?.id ?? null, input.scheduledStart, input.scheduledEnd, technicianChanged ? 1 : 0],
      );
      const updated = rows[0]!;
      const pick = (r: WorkOrderRow) => ({
        technicianId: r.technician_id, scheduledStart: r.scheduled_start, scheduledEnd: r.scheduled_end,
      });
      const d = diff(pick(current), pick(updated));
      if (d.changed) {
        await writeAudit(tx, {
          orgId, actorType: 'user', actorId: userId, action: 'work_order.assignment_changed',
          targetType: 'work_order', targetId: id, workOrderId: id, before: pick(current), after: pick(updated),
          requestId: ctx.requestId,
        });
      }
      if (tech && technicianChanged) {
        await insertAssignmentNotification(tx, {
          id, orgId, reference: updated.reference, title: updated.title, siteName: updated.site_name,
          scheduledStart: updated.scheduled_start!, scheduledEnd: updated.scheduled_end!,
          assignmentVersion: updated.assignment_version,
        }, tech, ctx.requestId);
      }
      return { before: current, after: updated };
    }),
  );
  await publish(ctx, 'work_order.assignment_changed', after, [before.technician_id, after.technician_id]);
  return reload(ctx, id);
}

/**
 * Applies a status change inside an existing transaction. Shared by the
 * dispatcher status endpoint and technician progress events so both enforce
 * identical rules and write identical audit entries.
 */
export async function applyStatusChange(
  tx: Tx,
  ctx: { auth: AuthContext; requestId: string },
  current: WorkOrderRow,
  to: Status,
  meta: { note?: string; source: 'api' | 'progress_event'; eventId?: string },
): Promise<WorkOrderRow> {
  if (current.status === to) return current; // no-op, nothing to record
  if (!canTransition(current.status, to)) {
    throw conflict('INVALID_TRANSITION', `Cannot change status from ${current.status} to ${to}`, {
      from: current.status, to,
    });
  }
  if (to === 'in_progress' && !current.technician_id) {
    throw conflict('INVALID_TRANSITION', 'Assign a technician before starting work');
  }
  const { rows } = await tx.query<WorkOrderRow>(
    'UPDATE work_orders SET status = $3, version = version + 1 WHERE id = $1 AND org_id = $2 RETURNING *',
    [current.id, current.org_id, to],
  );
  const updated = rows[0]!;
  await writeAudit(tx, {
    orgId: current.org_id, actorType: 'user', actorId: ctx.auth.userId, action: 'work_order.status_changed',
    targetType: 'work_order', targetId: current.id, workOrderId: current.id,
    before: { status: current.status }, after: { status: to },
    metadata: { source: meta.source, ...(meta.note ? { note: meta.note } : {}), ...(meta.eventId ? { eventId: meta.eventId } : {}) },
    requestId: ctx.requestId,
  });
  return updated;
}

export async function changeStatus(ctx: ServiceCtx, id: string, input: { status: Status; note?: string; version?: number }) {
  const updated = await withTransaction(async (tx) => {
    const current = await lockInScope(tx, scopeOf(ctx.auth), id);
    if (!current) throw notFound('Work order');
    assertVersion(current, input.version);
    return applyStatusChange(tx, ctx, current, input.status, { note: input.note, source: 'api' });
  });
  await publish(ctx, 'work_order.status_changed', updated, [updated.technician_id]);
  return reload(ctx, id);
}

export const publishWorkOrderEvent = publish;
