import { query } from '../infrastructure/db.js';
import { WorkOrder, WorkOrderWithDetails, DashboardMetrics } from '../domain/models/work-order.model.js';
import { ListWorkOrdersQueryDTO } from '../api/dtos/work-order.dto.js';

export interface PaginatedWorkOrders {
  data: WorkOrderWithDetails[];
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
  };
}

export class WorkOrderRepository {
  async findMany(
    orgId: string,
    filters: ListWorkOrdersQueryDTO,
    role?: string,
    userId?: string
  ): Promise<PaginatedWorkOrders> {
    const conditions: string[] = ['wo.organisation_id = $1'];
    const params: any[] = [orgId];
    let paramIndex = 2;

    // Strict Technician Scoping
    if (role === 'technician' && userId) {
      conditions.push(`wo.assigned_technician_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    } else if (filters.technicianId) {
      conditions.push(`wo.assigned_technician_id = $${paramIndex}`);
      params.push(filters.technicianId);
      paramIndex++;
    }

    if (filters.status) {
      conditions.push(`wo.status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.priority) {
      conditions.push(`wo.priority = $${paramIndex}`);
      params.push(filters.priority);
      paramIndex++;
    }

    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(
        `(wo.reference_number ILIKE $${paramIndex} OR wo.title ILIKE $${paramIndex} OR wo.site_name ILIKE $${paramIndex})`
      );
      params.push(term);
      paramIndex++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // 1. Total count query
    const countQuery = `SELECT COUNT(*) AS count FROM work_orders wo ${whereClause}`;
    const countResult = await query<{ count: string }>(countQuery, params);
    const totalRecords = parseInt(countResult.rows[0]?.count || '0', 10);

    // 2. Data query
    const validSortFields: Record<string, string> = {
      created_at: 'wo.created_at',
      scheduled_start: 'wo.scheduled_start',
      priority: 'wo.priority',
      status: 'wo.status',
    };
    const sortColumn = validSortFields[filters.sortBy] || 'wo.created_at';
    const sortDir = filters.sortOrder?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const limit = filters.limit;
    const offset = (filters.page - 1) * limit;

    const dataParams = [...params, limit, offset];
    const dataQuery = `
      SELECT 
        wo.id,
        wo.organisation_id,
        wo.reference_number,
        wo.title,
        wo.description,
        wo.priority,
        wo.status,
        wo.site_name,
        wo.assigned_technician_id,
        wo.scheduled_start,
        wo.scheduled_end,
        wo.created_by,
        wo.created_at,
        wo.updated_at,
        u_tech.name AS technician_name,
        u_tech.email AS technician_email,
        u_creator.name AS creator_name
      FROM work_orders wo
      LEFT JOIN users u_tech ON wo.assigned_technician_id = u_tech.id
      LEFT JOIN users u_creator ON wo.created_by = u_creator.id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDir}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataResult = await query<any>(dataQuery, dataParams);

    const data: WorkOrderWithDetails[] = dataResult.rows.map((row) => ({
      id: row.id,
      organisationId: row.organisation_id,
      referenceNumber: row.reference_number,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      siteName: row.site_name,
      assignedTechnicianId: row.assigned_technician_id,
      assignedTechnician: row.assigned_technician_id
        ? {
            id: row.assigned_technician_id,
            name: row.technician_name || 'Assigned Technician',
            email: row.technician_email,
          }
        : null,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      createdBy: row.created_by,
      creator: row.created_by
        ? {
            id: row.created_by,
            name: row.creator_name || 'Creator',
          }
        : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const totalPages = Math.ceil(totalRecords / limit) || 1;

    return {
      data,
      pagination: {
        page: filters.page,
        limit,
        totalRecords,
        totalPages,
      },
    };
  }

  async findById(
    id: string,
    orgId: string,
    role?: string,
    userId?: string
  ): Promise<WorkOrderWithDetails | null> {
    const conditions: string[] = ['wo.id = $1', 'wo.organisation_id = $2'];
    const params: any[] = [id, orgId];

    if (role === 'technician' && userId) {
      conditions.push('wo.assigned_technician_id = $3');
      params.push(userId);
    }

    const text = `
      SELECT 
        wo.id,
        wo.organisation_id,
        wo.reference_number,
        wo.title,
        wo.description,
        wo.priority,
        wo.status,
        wo.site_name,
        wo.assigned_technician_id,
        wo.scheduled_start,
        wo.scheduled_end,
        wo.created_by,
        wo.created_at,
        wo.updated_at,
        u_tech.name AS technician_name,
        u_tech.email AS technician_email,
        u_creator.name AS creator_name
      FROM work_orders wo
      LEFT JOIN users u_tech ON wo.assigned_technician_id = u_tech.id
      LEFT JOIN users u_creator ON wo.created_by = u_creator.id
      WHERE ${conditions.join(' AND ')}
    `;

    const res = await query<any>(text, params);
    if (!res.rows.length) return null;

    const row = res.rows[0];

    // Fetch recent audit logs for this work order
    const auditRes = await query<any>(
      `SELECT * FROM audit_logs WHERE target_id = $1 AND organisation_id = $2 ORDER BY created_at DESC LIMIT 10`,
      [id, orgId]
    );

    return {
      id: row.id,
      organisationId: row.organisation_id,
      referenceNumber: row.reference_number,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      siteName: row.site_name,
      assignedTechnicianId: row.assigned_technician_id,
      assignedTechnician: row.assigned_technician_id
        ? {
            id: row.assigned_technician_id,
            name: row.technician_name || 'Assigned Technician',
            email: row.technician_email,
          }
        : null,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      createdBy: row.created_by,
      creator: row.created_by
        ? {
            id: row.created_by,
            name: row.creator_name || 'Creator',
          }
        : undefined,
      attachments: [],
      auditLogs: auditRes.rows.map((al) => ({
        id: al.id,
        action: al.action,
        actorId: al.actor_id,
        beforeState: al.before_state,
        afterState: al.after_state,
        createdAt: al.created_at,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async create(data: {
    id?: string;
    organisationId: string;
    referenceNumber: string;
    title: string;
    description?: string | null;
    priority: string;
    status: string;
    siteName: string;
    assignedTechnicianId?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    createdBy: string;
  }): Promise<WorkOrderWithDetails> {
    const text = `
      INSERT INTO work_orders (
        id, organisation_id, reference_number, title, description,
        priority, status, site_name, assigned_technician_id,
        scheduled_start, scheduled_end, created_by
      ) VALUES (
        COALESCE($1, uuid_generate_v4()), $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11, $12
      ) RETURNING *
    `;

    const params = [
      data.id || null,
      data.organisationId,
      data.referenceNumber,
      data.title,
      data.description || null,
      data.priority,
      data.status,
      data.siteName,
      data.assignedTechnicianId || null,
      data.scheduledStart || null,
      data.scheduledEnd || null,
      data.createdBy,
    ];

    const res = await query<any>(text, params);
    const row = res.rows[0];

    return {
      id: row.id,
      organisationId: row.organisation_id,
      referenceNumber: row.reference_number,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      siteName: row.site_name,
      assignedTechnicianId: row.assigned_technician_id,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async update(
    id: string,
    orgId: string,
    data: {
      title?: string;
      description?: string | null;
      priority?: string;
      status?: string;
      siteName?: string;
      assignedTechnicianId?: string | null;
      scheduledStart?: string | null;
      scheduledEnd?: string | null;
    }
  ): Promise<WorkOrderWithDetails | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${idx++}`);
      params.push(data.title);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${idx++}`);
      params.push(data.description);
    }
    if (data.priority !== undefined) {
      fields.push(`priority = $${idx++}`);
      params.push(data.priority);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${idx++}`);
      params.push(data.status);
    }
    if (data.siteName !== undefined) {
      fields.push(`site_name = $${idx++}`);
      params.push(data.siteName);
    }
    if (data.assignedTechnicianId !== undefined) {
      fields.push(`assigned_technician_id = $${idx++}`);
      params.push(data.assignedTechnicianId);
    }
    if (data.scheduledStart !== undefined) {
      fields.push(`scheduled_start = $${idx++}`);
      params.push(data.scheduledStart);
    }
    if (data.scheduledEnd !== undefined) {
      fields.push(`scheduled_end = $${idx++}`);
      params.push(data.scheduledEnd);
    }

    if (fields.length === 0) {
      return this.findById(id, orgId);
    }

    fields.push(`updated_at = NOW()`);

    params.push(id, orgId);
    const text = `
      UPDATE work_orders
      SET ${fields.join(', ')}
      WHERE id = $${idx++} AND organisation_id = $${idx++}
      RETURNING *
    `;

    const res = await query<any>(text, params);
    if (!res.rows.length) return null;

    const row = res.rows[0];
    return {
      id: row.id,
      organisationId: row.organisation_id,
      referenceNumber: row.reference_number,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      siteName: row.site_name,
      assignedTechnicianId: row.assigned_technician_id,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getCount(orgId: string): Promise<number> {
    const text = `SELECT COUNT(*) AS count FROM work_orders WHERE organisation_id = $1`;
    const res = await query<{ count: string }>(text, [orgId]);
    return parseInt(res.rows[0]?.count || '0', 10);
  }

  async getMetrics(orgId: string, role?: string, userId?: string): Promise<DashboardMetrics> {
    const conditions = ['organisation_id = $1'];
    const params: any[] = [orgId];

    if (role === 'technician' && userId) {
      conditions.push('assigned_technician_id = $2');
      params.push(userId);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const text = `
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'open') AS open,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'blocked') AS blocked,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed
      FROM work_orders
      ${where}
    `;

    const res = await query<any>(text, params);
    const row = res.rows[0] || {};

    return {
      total: parseInt(row.total || '0', 10),
      open: parseInt(row.open || '0', 10),
      inProgress: parseInt(row.in_progress || '0', 10),
      blocked: parseInt(row.blocked || '0', 10),
      completed: parseInt(row.completed || '0', 10),
    };
  }

  async createAuditLog(entry: {
    organisationId: string;
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    beforeState?: any;
    afterState?: any;
    metadata?: any;
  }): Promise<void> {
    const text = `
      INSERT INTO audit_logs (
        organisation_id, actor_id, action, target_type, target_id,
        before_state, after_state, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    await query(text, [
      entry.organisationId,
      entry.actorId,
      entry.action,
      entry.targetType,
      entry.targetId,
      entry.beforeState ? JSON.stringify(entry.beforeState) : null,
      entry.afterState ? JSON.stringify(entry.afterState) : null,
      entry.metadata ? JSON.stringify(entry.metadata) : '{}',
    ]);
  }

  async findConflictingSchedule(
    techId: string,
    start: Date,
    end: Date,
    excludeWorkOrderId?: string
  ): Promise<{ id: string; referenceNumber: string; scheduledStart: Date; scheduledEnd: Date } | null> {
    const text = `
      SELECT id, reference_number, scheduled_start, scheduled_end
      FROM work_orders
      WHERE assigned_technician_id = $1
        AND status NOT IN ('cancelled', 'completed')
        AND scheduled_start IS NOT NULL
        AND scheduled_end IS NOT NULL
        AND ($4::uuid IS NULL OR id != $4)
        AND tstzrange(scheduled_start, scheduled_end, '[)') && tstzrange($2, $3, '[)')
      LIMIT 1
    `;
    const res = await query<any>(text, [
      techId,
      start.toISOString(),
      end.toISOString(),
      excludeWorkOrderId || null,
    ]);

    if (!res.rows.length) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      referenceNumber: row.reference_number,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
    };
  }

  async assignTechnician(
    id: string,
    orgId: string,
    techId: string,
    start: Date,
    end: Date
  ): Promise<WorkOrderWithDetails | null> {
    const text = `
      UPDATE work_orders
      SET 
        assigned_technician_id = $3,
        scheduled_start = $4,
        scheduled_end = $5,
        updated_at = NOW()
      WHERE id = $1 AND organisation_id = $2
      RETURNING *
    `;
    const res = await query<any>(text, [
      id,
      orgId,
      techId,
      start.toISOString(),
      end.toISOString(),
    ]);

    if (!res.rows.length) return null;
    const row = res.rows[0];

    // Fetch technician details
    const techRes = await query<any>(
      `SELECT name, email FROM users WHERE id = $1 AND organisation_id = $2`,
      [techId, orgId]
    );
    const tech = techRes.rows[0];

    return {
      id: row.id,
      organisationId: row.organisation_id,
      referenceNumber: row.reference_number,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      siteName: row.site_name,
      assignedTechnicianId: row.assigned_technician_id,
      assignedTechnician: tech
        ? {
            id: row.assigned_technician_id,
            name: tech.name,
            email: tech.email,
          }
        : null,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const workOrderRepository = new WorkOrderRepository();

