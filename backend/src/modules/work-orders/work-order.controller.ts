import type { RequestHandler } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors.js';
import type { Database } from '../../database/pool.js';
import { inTransaction } from '../../database/pool.js';
import { getIdentity } from '../auth/auth.middleware.js';
import type { RuntimeServices } from '../../infrastructure/runtime.js';

const idParams = z.object({ id: z.string().uuid() });
const fields = {
  referenceNumber: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).default(''),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  status: z.enum(['draft', 'scheduled', 'in_progress', 'completed', 'cancelled']).default('draft'),
  assignedTechnicianId: z.string().uuid().nullable().default(null),
  scheduledStart: z.coerce.date().nullable().default(null),
  scheduledEnd: z.coerce.date().nullable().default(null),
  siteName: z.string().trim().min(1).max(200)
};
const createInput = z.object(fields).strict().superRefine(validateWindow);
const updateInput = z.object(fields).partial().strict();
const windowInput = z.object({ scheduledStart: z.coerce.date().nullable(), scheduledEnd: z.coerce.date().nullable() }).superRefine(validateWindow);

function validateWindow(value: { scheduledStart?: Date | null; scheduledEnd?: Date | null }, context: z.RefinementCtx) {
  if ((value.scheduledStart === null) !== (value.scheduledEnd === null)) {
    context.addIssue({ code: 'custom', message: 'scheduledStart and scheduledEnd must be provided together' });
  }
  if (value.scheduledStart && value.scheduledEnd && value.scheduledStart >= value.scheduledEnd) {
    context.addIssue({ code: 'custom', message: 'scheduledEnd must be after scheduledStart' });
  }
}

const selectColumns = `id, reference_number AS "referenceNumber", title, description, priority, status,
  assigned_technician_id AS "assignedTechnicianId", scheduled_start AS "scheduledStart",
  scheduled_end AS "scheduledEnd", site_name AS "siteName", created_by_id AS "createdById",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

function technicianScope(role: string, userId: string, startAt = 2) {
  return role === 'technician' ? { sql: ` AND assigned_technician_id = $${startAt}`, params: [userId] } : { sql: '', params: [] };
}

function mapInput(input: Record<string, unknown>) {
  const mapping: Record<string, string> = {
    referenceNumber: 'reference_number', title: 'title', description: 'description', priority: 'priority', status: 'status',
    assignedTechnicianId: 'assigned_technician_id', scheduledStart: 'scheduled_start', scheduledEnd: 'scheduled_end', siteName: 'site_name'
  };
  return Object.entries(input).map(([key, value]) => [mapping[key]!, value] as const);
}

function translateConstraint(error: unknown): never {
  const dbError = error as { code?: string; constraint?: string };
  if (dbError.code === '23P01' && dbError.constraint === 'technician_schedule_no_overlap') {
    throw conflict('The technician already has a work order in this time window', { field: 'schedule' });
  }
  if (dbError.code === '23505') throw conflict('The reference number is already in use');
  throw error;
}

export function listWorkOrders(database: Database): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity);
    const query = z.object({
      search: z.string().trim().max(200).optional(), status: fields.status.optional(), priority: fields.priority.optional(),
      sort: z.enum(['createdAt', 'scheduledStart', 'priority', 'status']).default('createdAt'),
      direction: z.enum(['asc', 'desc']).default('desc'), page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    }).parse(request.query);
    const params: unknown[] = [identity.organisationId];
    const conditions = ['organisation_id = $1'];
    if (identity.role === 'technician') { params.push(identity.userId); conditions.push(`assigned_technician_id = $${params.length}`); }
    if (query.status) { params.push(query.status); conditions.push(`status = $${params.length}`); }
    if (query.priority) { params.push(query.priority); conditions.push(`priority = $${params.length}`); }
    if (query.search) { params.push(`%${query.search}%`); conditions.push(`(reference_number ILIKE $${params.length} OR title ILIKE $${params.length} OR site_name ILIKE $${params.length})`); }
    const sortMap = { createdAt: 'created_at', scheduledStart: 'scheduled_start', priority: 'priority', status: 'status' } as const;
    const where = conditions.join(' AND ');
    const countParams = [...params];
    params.push(query.limit, (query.page - 1) * query.limit);
    const [items, total] = await Promise.all([
      database.query(`SELECT ${selectColumns} FROM work_orders WHERE ${where} ORDER BY ${sortMap[query.sort]} ${query.direction} NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
      database.query<{ count: string }>(`SELECT count(*) FROM work_orders WHERE ${where}`, countParams)
    ]);
    response.json({ data: items.rows, meta: { page: query.page, limit: query.limit, total: Number(total.rows[0]?.count ?? 0) } });
  });
}

export function getWorkOrder(database: Database): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity);
    const { id } = idParams.parse(request.params);
    const scope = technicianScope(identity.role, identity.userId);
    const result = await database.query(`SELECT ${selectColumns} FROM work_orders WHERE organisation_id = $1 AND id = $2${scope.sql}`, [identity.organisationId, id, ...scope.params]);
    if (!result.rows[0]) throw notFound('Work order not found');
    const [history, attachments, events] = await Promise.all([
      database.query(`SELECT action, actor_user_id AS "actorUserId", before_data AS "before", after_data AS "after", metadata, created_at AS "createdAt" FROM audit_entries WHERE organisation_id = $1 AND target_type = 'work_order' AND target_id = $2 ORDER BY created_at DESC`, [identity.organisationId, id]),
      database.query(`SELECT id, original_name AS "originalName", content_type AS "contentType", size_bytes AS "sizeBytes", uploaded_by_id AS "uploadedById", created_at AS "createdAt" FROM attachments WHERE organisation_id = $1 AND work_order_id = $2 ORDER BY created_at DESC`, [identity.organisationId, id]),
      database.query(`SELECT event_id AS "eventId", type, occurred_at AS "occurredAt", payload, submitted_by_id AS "submittedById", created_at AS "createdAt" FROM progress_events WHERE organisation_id = $1 AND work_order_id = $2 ORDER BY occurred_at DESC`, [identity.organisationId, id])
    ]);
    response.json({ data: { ...result.rows[0], history: history.rows, attachments: attachments.rows, progressEvents: events.rows } });
  });
}

export function createWorkOrder(database: Database, runtime: RuntimeServices): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity);
    const input = createInput.parse(request.body);
    const entries = mapInput(input);
    try {
      const row = await inTransaction(database, async (client) => {
        if (input.assignedTechnicianId) {
          const technician = await client.query(`SELECT 1 FROM users WHERE organisation_id = $1 AND id = $2 AND role = 'technician' AND is_active FOR SHARE`, [identity.organisationId, input.assignedTechnicianId]);
          if (!technician.rowCount) throw conflict('Assigned user is not an active technician in this organisation');
        }
        const columns = entries.map(([key]) => key);
        const created = await client.query(`INSERT INTO work_orders (organisation_id, created_by_id, ${columns.join(', ')}) VALUES ($1, $2, ${entries.map((_, index) => `$${index + 3}`).join(', ')}) RETURNING ${selectColumns}`, [identity.organisationId, identity.userId, ...entries.map(([, value]) => value)]);
        const workOrder = created.rows[0];
        await client.query(`INSERT INTO audit_entries (organisation_id, actor_user_id, action, target_type, target_id, after_data) VALUES ($1, $2, 'work_order.created', 'work_order', $3, $4)`, [identity.organisationId, identity.userId, workOrder.id, workOrder]);
        if (input.assignedTechnicianId) await client.query(`INSERT INTO notification_jobs (organisation_id, work_order_id, technician_id, deduplication_key) VALUES ($1, $2, $3, $4)`, [identity.organisationId, workOrder.id, input.assignedTechnicianId, `${workOrder.id}:${input.assignedTechnicianId}:${workOrder.updatedAt.toISOString()}`]);
        return workOrder;
      });
      await runtime.publish(identity.organisationId, 'work_order.created', row);
      response.status(201).json({ data: row });
    } catch (error) { translateConstraint(error); }
  });
}

export function updateWorkOrder(database: Database, runtime: RuntimeServices): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity);
    const { id } = idParams.parse(request.params);
    const input = updateInput.parse(request.body);
    if (!Object.keys(input).length) throw new z.ZodError([{ code: 'custom', path: [], message: 'At least one field is required' }]);
    if (identity.role === 'technician') throw forbidden();
    try {
      const updated = await inTransaction(database, async (client) => {
        const prior = await client.query(`SELECT ${selectColumns} FROM work_orders WHERE organisation_id = $1 AND id = $2 FOR UPDATE`, [identity.organisationId, id]);
        if (!prior.rows[0]) throw notFound('Work order not found');
        windowInput.parse({ scheduledStart: prior.rows[0].scheduledStart, scheduledEnd: prior.rows[0].scheduledEnd, ...input });
        if (input.assignedTechnicianId) {
          const technician = await client.query(`SELECT 1 FROM users WHERE organisation_id = $1 AND id = $2 AND role = 'technician' AND is_active FOR SHARE`, [identity.organisationId, input.assignedTechnicianId]);
          if (!technician.rowCount) throw conflict('Assigned user is not an active technician in this organisation');
        }
        const entries = mapInput(input);
        const result = await client.query(`UPDATE work_orders SET ${entries.map(([key], index) => `${key} = $${index + 3}`).join(', ')}, updated_at = now() WHERE organisation_id = $1 AND id = $2 RETURNING ${selectColumns}`, [identity.organisationId, id, ...entries.map(([, value]) => value)]);
        const row = result.rows[0];
        await client.query(`INSERT INTO audit_entries (organisation_id, actor_user_id, action, target_type, target_id, before_data, after_data) VALUES ($1, $2, 'work_order.updated', 'work_order', $3, $4, $5)`, [identity.organisationId, identity.userId, id, prior.rows[0], row]);
        if (input.assignedTechnicianId && input.assignedTechnicianId !== prior.rows[0].assignedTechnicianId) await client.query(`INSERT INTO notification_jobs (organisation_id, work_order_id, technician_id, deduplication_key) VALUES ($1, $2, $3, $4)`, [identity.organisationId, id, input.assignedTechnicianId, `${id}:${input.assignedTechnicianId}:${row.updatedAt.toISOString()}`]);
        return row;
      });
      await runtime.publish(identity.organisationId, 'work_order.updated', updated);
      response.json({ data: updated });
    } catch (error) { translateConstraint(error); }
  });
}

export function deleteWorkOrder(database: Database, runtime: RuntimeServices): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity); const { id } = idParams.parse(request.params);
    const removed = await inTransaction(database, async (client) => {
      const prior = await client.query(`SELECT ${selectColumns} FROM work_orders WHERE organisation_id = $1 AND id = $2 FOR UPDATE`, [identity.organisationId, id]);
      if (!prior.rows[0]) throw notFound('Work order not found');
      const cancelled = await client.query(`UPDATE work_orders SET status = 'cancelled', updated_at = now() WHERE organisation_id = $1 AND id = $2 RETURNING ${selectColumns}`, [identity.organisationId, id]);
      await client.query(`INSERT INTO audit_entries (organisation_id, actor_user_id, action, target_type, target_id, before_data, after_data) VALUES ($1, $2, 'work_order.cancelled', 'work_order', $3, $4, $5)`, [identity.organisationId, identity.userId, id, prior.rows[0], cancelled.rows[0]]);
      return cancelled.rows[0];
    });
    await runtime.publish(identity.organisationId, 'work_order.cancelled', { id });
    response.status(200).json({ data: removed });
  });
}

export function technicianAvailability(database: Database): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity);
    const query = z.object({ technicianId: z.string().uuid(), start: z.coerce.date(), end: z.coerce.date(), excludeWorkOrderId: z.string().uuid().optional() }).parse(request.query);
    if (query.start >= query.end) throw badRequest('end must be after start');
    const technician = await database.query(`SELECT 1 FROM users WHERE organisation_id = $1 AND id = $2 AND role = 'technician' AND is_active`, [identity.organisationId, query.technicianId]);
    if (!technician.rowCount) throw notFound('Technician not found');
    const result = await database.query(`SELECT id, reference_number AS "referenceNumber", title, scheduled_start AS "scheduledStart", scheduled_end AS "scheduledEnd" FROM work_orders WHERE organisation_id = $1 AND assigned_technician_id = $2 AND status <> 'cancelled' AND tstzrange(scheduled_start, scheduled_end, '[)') && tstzrange($3, $4, '[)') AND ($5::uuid IS NULL OR id <> $5) ORDER BY scheduled_start`, [identity.organisationId, query.technicianId, query.start, query.end, query.excludeWorkOrderId ?? null]);
    response.json({ data: { available: result.rows.length === 0, conflicts: result.rows } });
  });
}
