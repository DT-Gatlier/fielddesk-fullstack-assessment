import { Router } from 'express';
import { pool } from '../../../../shared/db';
import type { AppDeps } from '../../deps';
import { notFound } from '../../lib/errors';
import { authOf, requirePermission } from '../../middleware/auth';
import { parseBody, parseParams, parseQuery, uuidParam } from '../../middleware/validate';
import { toAuditEntry } from '../organisation/routes';
import { toAttachment, type AttachmentRow } from '../attachments/routes';
import { exportCsv } from '../reports/csv';
import { buildListQuery, findInScope, scopeOf, SELECT_WITH_NAMES, toWorkOrder, type WorkOrderRow } from './repository';
import { assignmentSchema, createSchema, listQuerySchema, statusSchema, updateSchema } from './schemas';
import { assignWorkOrder, changeStatus, createWorkOrder, updateWorkOrder, type ServiceCtx } from './service';

export function workOrdersRouter(deps: AppDeps): Router {
  const router = Router();
  const ctxOf = (req: Parameters<typeof authOf>[0]): ServiceCtx => ({ auth: authOf(req), requestId: String(req.id), redis: deps.redis });

  router.get('/', requirePermission('workOrders:read'), async (req, res) => {
    const q = parseQuery(req, listQuerySchema);
    const { whereSql, orderBy, params } = buildListQuery(scopeOf(authOf(req)), q);
    const offset = (q.page - 1) * q.pageSize;
    const [list, count] = await Promise.all([
      pool.query<WorkOrderRow>(
        `${SELECT_WITH_NAMES} WHERE ${whereSql} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, q.pageSize, offset],
      ),
      pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM work_orders w WHERE ${whereSql}`, params),
    ]);
    const total = count.rows[0]!.total;
    res.json({
      data: list.rows.map(toWorkOrder),
      meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) },
    });
  });

  // Same filters and scope as the list, streamed as CSV.
  router.get('/export.csv', requirePermission('workOrders:export'), async (req, res) => {
    const q = parseQuery(req, listQuerySchema);
    await exportCsv(req, res, scopeOf(authOf(req)), q);
  });

  router.get('/summary', requirePermission('workOrders:read'), async (req, res) => {
    const scope = scopeOf(authOf(req));
    const { rows } = await pool.query(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE status = 'open')::int AS open,
         count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
         count(*) FILTER (WHERE status = 'on_hold')::int AS on_hold,
         count(*) FILTER (WHERE status = 'completed')::int AS completed,
         count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
         count(*) FILTER (WHERE technician_id IS NULL AND status NOT IN ('completed','cancelled'))::int AS unassigned,
         count(*) FILTER (WHERE priority IN ('high','urgent') AND status NOT IN ('completed','cancelled'))::int AS high_priority_active,
         count(*) FILTER (WHERE scheduled_end < now() AND status NOT IN ('completed','cancelled'))::int AS overdue,
         count(*) FILTER (WHERE scheduled_start >= date_trunc('day', now()) AND scheduled_start < date_trunc('day', now()) + interval '1 day')::int AS scheduled_today
       FROM work_orders
       WHERE org_id = $1 AND ($2::uuid IS NULL OR technician_id = $2)`,
      [scope.orgId, scope.technicianId],
    );
    const r = rows[0];
    res.json({
      data: {
        total: r.total,
        byStatus: { open: r.open, in_progress: r.in_progress, on_hold: r.on_hold, completed: r.completed, cancelled: r.cancelled },
        unassigned: r.unassigned,
        highPriorityActive: r.high_priority_active,
        overdue: r.overdue,
        scheduledToday: r.scheduled_today,
      },
    });
  });

  router.post('/', requirePermission('workOrders:write'), async (req, res) => {
    const input = parseBody(req, createSchema);
    res.status(201).json({ data: await createWorkOrder(ctxOf(req), input) });
  });

  router.get('/:id', requirePermission('workOrders:read'), async (req, res) => {
    const { id } = parseParams(req, uuidParam);
    const auth = authOf(req);
    const row = await findInScope(pool, scopeOf(auth), id);
    if (!row) throw notFound('Work order');
    const [attachments, notifications] = await Promise.all([
      pool.query<AttachmentRow>(
        `SELECT a.*, u.name AS uploaded_by_name FROM attachments a LEFT JOIN users u ON u.id = a.uploaded_by
          WHERE a.org_id = $1 AND a.work_order_id = $2 ORDER BY a.created_at`,
        [auth.orgId, id],
      ),
      auth.role === 'technician'
        ? Promise.resolve({ rows: [] })
        : pool.query(
            `SELECT n.id, n.status, n.attempts, n.last_error, n.created_at, n.completed_at, u.name AS technician_name
               FROM notifications n JOIN users u ON u.id = n.technician_id
              WHERE n.org_id = $1 AND n.work_order_id = $2 ORDER BY n.created_at DESC LIMIT 10`,
            [auth.orgId, id],
          ),
    ]);
    res.json({
      data: {
        ...toWorkOrder(row),
        attachments: attachments.rows.map(toAttachment),
        notifications: notifications.rows.map((n) => ({
          id: n.id, status: n.status, attempts: n.attempts, lastError: n.last_error,
          technicianName: n.technician_name, createdAt: n.created_at, completedAt: n.completed_at,
        })),
      },
    });
  });

  router.get('/:id/activity', requirePermission('workOrders:read'), async (req, res) => {
    const { id } = parseParams(req, uuidParam);
    const auth = authOf(req);
    // Visibility check first: the activity of a work order you cannot see is "not found".
    if (!(await findInScope(pool, scopeOf(auth), id))) throw notFound('Work order');
    const { rows } = await pool.query(
      `SELECT a.*, u.name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.org_id = $1 AND a.work_order_id = $2 ORDER BY a.created_at, a.id`,
      [auth.orgId, id],
    );
    res.json({ data: rows.map(toAuditEntry) });
  });

  router.patch('/:id', requirePermission('workOrders:write'), async (req, res) => {
    const { id } = parseParams(req, uuidParam);
    const input = parseBody(req, updateSchema);
    res.json({ data: await updateWorkOrder(ctxOf(req), id, input) });
  });

  router.put('/:id/assignment', requirePermission('workOrders:write'), async (req, res) => {
    const { id } = parseParams(req, uuidParam);
    const input = parseBody(req, assignmentSchema);
    res.json({ data: await assignWorkOrder(ctxOf(req), id, input) });
  });

  router.post('/:id/status', requirePermission('workOrders:write'), async (req, res) => {
    const { id } = parseParams(req, uuidParam);
    const input = parseBody(req, statusSchema);
    res.json({ data: await changeStatus(ctxOf(req), id, input) });
  });

  return router;
}
