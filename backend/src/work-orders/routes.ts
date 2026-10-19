import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { toAttachment, type AttachmentRow } from '../attachments/model.js';
import { authenticate, authOf, requireRole } from '../auth/guards.js';
import { withOrg } from '../db/pool.js';
import type { Effects } from '../effects.js';
import { notFound } from '../http/errors.js';
import { parse } from '../http/validation.js';
import { streamWorkOrderCsv } from './export.js';
import { PRIORITIES, STATUSES, toWorkOrder, WORK_ORDER_COLUMNS, WORK_ORDER_FROM, type WorkOrderRow } from './model.js';
import { buildWorkOrderQuery, filterSchema, listQuerySchema } from './query.js';
import { createWorkOrder, loadWorkOrder, updateWorkOrder } from './service.js';

const MAX_WINDOW_MS = 14 * 24 * 3_600_000;
const isoDateTime = z.string().datetime({ offset: true, message: 'Must be an ISO 8601 date-time with a timezone.' });

function checkSchedule(
  value: { scheduledStart?: string | null; scheduledEnd?: string | null },
  ctx: z.RefinementCtx,
): void {
  const startGiven = value.scheduledStart !== undefined;
  const endGiven = value.scheduledEnd !== undefined;
  if (startGiven !== endGiven || (value.scheduledStart === null) !== (value.scheduledEnd === null)) {
    ctx.addIssue({ code: 'custom', path: ['scheduledEnd'], message: 'Provide both scheduledStart and scheduledEnd, or neither.' });
    return;
  }
  if (value.scheduledStart && value.scheduledEnd) {
    const duration = Date.parse(value.scheduledEnd) - Date.parse(value.scheduledStart);
    if (duration <= 0) {
      ctx.addIssue({ code: 'custom', path: ['scheduledEnd'], message: 'scheduledEnd must be after scheduledStart.' });
    } else if (duration > MAX_WINDOW_MS) {
      ctx.addIssue({ code: 'custom', path: ['scheduledEnd'], message: 'A scheduling window cannot exceed 14 days.' });
    }
  }
}

const createSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10_000).default(''),
    priority: z.enum(PRIORITIES).default('medium'),
    siteName: z.string().trim().min(1).max(200),
    assignedTechnicianId: z.string().uuid().nullable().default(null),
    scheduledStart: isoDateTime.nullable().default(null),
    scheduledEnd: isoDateTime.nullable().default(null),
  })
  .strict()
  .superRefine(checkSchedule);

const updateSchema = z
  .object({
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(10_000).optional(),
    priority: z.enum(PRIORITIES).optional(),
    siteName: z.string().trim().min(1).max(200).optional(),
    status: z.enum(STATUSES).optional(),
    assignedTechnicianId: z.string().uuid().nullable().optional(),
    scheduledStart: isoDateTime.nullable().optional(),
    scheduledEnd: isoDateTime.nullable().optional(),
  })
  .strict()
  .superRefine(checkSchedule);

const idParams = z.object({ id: z.string().uuid() });

interface ActivityRow {
  id: number;
  actor_type: 'user' | 'system';
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  before: unknown;
  after: unknown;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export async function workOrderRoutes(app: FastifyInstance): Promise<void> {
  const dispatch = (effects: Effects, request: FastifyRequest) =>
    effects.dispatch({ queue: app.notificationQueue, redis: app.redis, log: request.log });

  app.get('/api/work-orders', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const query = parse(listQuerySchema, request.query);
    const { where, orderBy, params } = buildWorkOrderQuery(auth, query);

    const rows = await withOrg(app.pg, auth.orgId, async (client) => {
      const result = await client.query<WorkOrderRow & { total: number }>(
        `SELECT ${WORK_ORDER_COLUMNS}, count(*) OVER()::int AS total ${WORK_ORDER_FROM}
         WHERE ${where} ORDER BY ${orderBy}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return result.rows;
    });

    let total = rows[0]?.total ?? 0;
    if (rows.length === 0 && query.page > 1) {
      // Past the last page: count separately so the client can still render pagination.
      total = await withOrg(app.pg, auth.orgId, async (client) => {
        const result = await client.query<{ total: number }>(
          `SELECT count(*)::int AS total FROM work_orders wo WHERE ${where}`,
          params,
        );
        return result.rows[0]!.total;
      });
    }

    return {
      data: rows.map(toWorkOrder),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  });

  app.get('/api/work-orders/export.csv', { preHandler: authenticate }, async (request, reply) => {
    const auth = authOf(request);
    const filters = parse(filterSchema.strict(), request.query);
    const filename = `work-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .header('cache-control', 'no-store');
    return reply.send(streamWorkOrderCsv(app.pg, auth, filters, request.log));
  });

  app.get('/api/work-orders/:id', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const { id } = parse(idParams, request.params);

    const result = await withOrg(app.pg, auth.orgId, async (client) => {
      const row = await loadWorkOrder(client, auth, id);
      if (!row) return null;
      const attachments = await client.query<AttachmentRow>(
        `SELECT a.id, a.original_filename, a.content_type, a.size_bytes, a.uploaded_by, u.name AS uploaded_by_name, a.created_at
         FROM attachments a JOIN users u ON u.id = a.uploaded_by AND u.org_id = a.org_id
         WHERE a.org_id = $1 AND a.work_order_id = $2 ORDER BY a.created_at`,
        [auth.orgId, id],
      );
      const activity = await client.query<ActivityRow>(
        `SELECT l.id, l.actor_type, l.actor_id, u.name AS actor_name, l.action, l.before, l.after, l.metadata, l.created_at
         FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id AND u.org_id = l.org_id
         WHERE l.org_id = $1 AND l.target_type = 'work_order' AND l.target_id = $2
         ORDER BY l.created_at DESC, l.id DESC LIMIT 200`,
        [auth.orgId, id],
      );
      return { row, attachments: attachments.rows, activity: activity.rows };
    });
    if (!result) throw notFound('Work order');

    return {
      data: {
        ...toWorkOrder(result.row),
        attachments: result.attachments.map(toAttachment),
        activity: result.activity.map((entry) => ({
          id: entry.id,
          action: entry.action,
          actor: entry.actor_type === 'system' ? { type: 'system' } : { type: 'user', id: entry.actor_id, name: entry.actor_name },
          before: entry.before,
          after: entry.after,
          metadata: entry.metadata,
          createdAt: entry.created_at.toISOString(),
        })),
      },
    };
  });

  app.post('/api/work-orders', { preHandler: requireRole('owner', 'dispatcher') }, async (request, reply) => {
    const auth = authOf(request);
    const input = parse(createSchema, request.body);
    const { row, effects } = await createWorkOrder(app.pg, auth, input, request.id);
    await dispatch(effects, request);
    return reply.status(201).send({ data: toWorkOrder(row) });
  });

  app.patch('/api/work-orders/:id', { preHandler: requireRole('owner', 'dispatcher') }, async (request) => {
    const auth = authOf(request);
    const { id } = parse(idParams, request.params);
    const input = parse(updateSchema, request.body);
    const { row, effects } = await updateWorkOrder(app.pg, auth, id, input, request.id);
    await dispatch(effects, request);
    return { data: toWorkOrder(row) };
  });

  app.get('/api/dashboard/summary', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const technicianOnly = auth.role === 'technician';
    const summary = await withOrg(app.pg, auth.orgId, async (client) => {
      const { rows } = await client.query<{ status: string; count: number }>(
        `SELECT status, count(*)::int AS count FROM work_orders
         WHERE org_id = $1 AND ($2::uuid IS NULL OR assigned_technician_id = $2)
         GROUP BY status`,
        [auth.orgId, technicianOnly ? auth.userId : null],
      );
      const totals = await client.query<{ total: number; unassigned: number; overdue: number; today: number; urgent: number }>(
        `SELECT
           count(*)::int AS total,
           count(*) FILTER (WHERE assigned_technician_id IS NULL AND status NOT IN ('completed', 'cancelled'))::int AS unassigned,
           count(*) FILTER (WHERE scheduled_end < now() AND status NOT IN ('completed', 'cancelled'))::int AS overdue,
           count(*) FILTER (WHERE scheduled_start >= date_trunc('day', now()) AND scheduled_start < date_trunc('day', now()) + interval '1 day')::int AS today,
           count(*) FILTER (WHERE priority = 'urgent' AND status NOT IN ('completed', 'cancelled'))::int AS urgent
         FROM work_orders
         WHERE org_id = $1 AND ($2::uuid IS NULL OR assigned_technician_id = $2)`,
        [auth.orgId, technicianOnly ? auth.userId : null],
      );
      return { byStatus: rows, totals: totals.rows[0]! };
    });

    return {
      data: {
        byStatus: Object.fromEntries(STATUSES.map((status) => [status, summary.byStatus.find((r) => r.status === status)?.count ?? 0])),
        ...summary.totals,
      },
    };
  });
}
