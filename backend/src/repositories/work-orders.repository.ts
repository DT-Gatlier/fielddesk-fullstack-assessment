import type pg from "pg";
import type {
  DashboardSummary,
  WorkOrder,
  WorkOrderListQuery,
  WorkOrderListResult,
  WorkOrderPriority,
  WorkOrderStatus,
} from "../types/work-order.js";

type WorkOrderRow = {
  id: string;
  organisation_id: string;
  created_by_user_id: string;
  assigned_technician_id: string | null;
  reference_number: string;
  title: string;
  description: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  scheduled_start: Date | null;
  scheduled_end: Date | null;
  site_name: string;
  assignment_version: number;
  created_at: Date;
  updated_at: Date;
};

function mapWorkOrder(row: WorkOrderRow): WorkOrder {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    createdByUserId: row.created_by_user_id,
    assignedTechnicianId: row.assigned_technician_id,
    referenceNumber: row.reference_number,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    scheduledStart: row.scheduled_start?.toISOString() ?? null,
    scheduledEnd: row.scheduled_end?.toISOString() ?? null,
    siteName: row.site_name,
    assignmentVersion: row.assignment_version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const SORT_COLUMNS: Record<WorkOrderListQuery["sortBy"], string> = {
  created_at: "wo.created_at",
  scheduled_start: "wo.scheduled_start",
  priority: "wo.priority",
  status: "wo.status",
};

type WorkOrderFilterQuery = Pick<
  WorkOrderListQuery,
  | "organisationId"
  | "assignedTechnicianId"
  | "search"
  | "status"
  | "priority"
  | "sortBy"
  | "sortOrder"
>;

function buildWorkOrderFilter(query: WorkOrderFilterQuery): {
  whereClause: string;
  values: unknown[];
  sortColumn: string;
  sortOrder: "ASC" | "DESC";
} {
  const conditions = ["wo.organisation_id = $1"];
  const values: unknown[] = [query.organisationId];
  let index = 2;

  if (query.assignedTechnicianId) {
    conditions.push(`wo.assigned_technician_id = $${index++}`);
    values.push(query.assignedTechnicianId);
  }

  if (query.status) {
    conditions.push(`wo.status = $${index++}`);
    values.push(query.status);
  }

  if (query.priority) {
    conditions.push(`wo.priority = $${index++}`);
    values.push(query.priority);
  }

  if (query.search) {
    conditions.push(
      `(wo.title ILIKE $${index} OR wo.reference_number ILIKE $${index} OR wo.site_name ILIKE $${index})`,
    );
    values.push(`%${query.search}%`);
    index++;
  }

  return {
    whereClause: conditions.join(" AND "),
    values,
    sortColumn: SORT_COLUMNS[query.sortBy],
    sortOrder: query.sortOrder === "asc" ? "ASC" : "DESC",
  };
}

export async function generateReferenceNumber(
  pool: pg.Pool,
  organisationId: string,
): Promise<string> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM work_orders WHERE organisation_id = $1`,
    [organisationId],
  );
  const count = Number(result.rows[0].count) + 1;
  return `WO-${String(count).padStart(5, "0")}`;
}

export async function createWorkOrder(
  pool: pg.Pool,
  input: {
    organisationId: string;
    createdByUserId: string;
    referenceNumber: string;
    title: string;
    description: string;
    priority: WorkOrderPriority;
    siteName: string;
    status?: WorkOrderStatus;
    assignedTechnicianId?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
  },
): Promise<WorkOrder> {
  const result = await pool.query<WorkOrderRow>(
    `INSERT INTO work_orders (
       organisation_id, created_by_user_id, reference_number, title, description,
       priority, site_name, status, assigned_technician_id, scheduled_start, scheduled_end
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      input.organisationId,
      input.createdByUserId,
      input.referenceNumber,
      input.title,
      input.description,
      input.priority,
      input.siteName,
      input.status ?? "draft",
      input.assignedTechnicianId ?? null,
      input.scheduledStart ?? null,
      input.scheduledEnd ?? null,
    ],
  );

  return mapWorkOrder(result.rows[0]);
}

export async function findWorkOrderByIdInOrg(
  pool: pg.Pool,
  workOrderId: string,
  organisationId: string,
): Promise<WorkOrder | null> {
  const result = await pool.query<WorkOrderRow>(
    `SELECT * FROM work_orders WHERE id = $1 AND organisation_id = $2`,
    [workOrderId, organisationId],
  );

  if (!result.rowCount) {
    return null;
  }

  return mapWorkOrder(result.rows[0]);
}

export async function findWorkOrderByIdInOrgWithClient(
  client: pg.PoolClient,
  workOrderId: string,
  organisationId: string,
): Promise<WorkOrder | null> {
  const result = await client.query<WorkOrderRow>(
    `SELECT * FROM work_orders
     WHERE id = $1 AND organisation_id = $2
     FOR UPDATE`,
    [workOrderId, organisationId],
  );

  if (!result.rowCount) {
    return null;
  }

  return mapWorkOrder(result.rows[0]);
}

export async function findAssignedWorkOrderForTechnicianWithClient(
  client: pg.PoolClient,
  workOrderId: string,
  organisationId: string,
  technicianId: string,
): Promise<WorkOrder | null> {
  const result = await client.query<WorkOrderRow>(
    `SELECT * FROM work_orders
     WHERE id = $1
       AND organisation_id = $2
       AND assigned_technician_id = $3
     FOR UPDATE`,
    [workOrderId, organisationId, technicianId],
  );

  if (!result.rowCount) {
    return null;
  }

  return mapWorkOrder(result.rows[0]);
}

export async function updateWorkOrderStatusWithClient(
  client: pg.PoolClient,
  workOrderId: string,
  organisationId: string,
  status: WorkOrderStatus,
): Promise<WorkOrder | null> {
  const result = await client.query<WorkOrderRow>(
    `UPDATE work_orders
     SET status = $3, updated_at = now()
     WHERE id = $1 AND organisation_id = $2
     RETURNING *`,
    [workOrderId, organisationId, status],
  );

  if (!result.rowCount) {
    return null;
  }

  return mapWorkOrder(result.rows[0]);
}

export class SchedulingOverlapError extends Error {
  constructor() {
    super("Technician already has an overlapping assignment during this window");
    this.name = "SchedulingOverlapError";
  }
}

export async function updateWorkOrder(
  pool: pg.Pool,
  workOrderId: string,
  organisationId: string,
  updates: {
    title?: string;
    description?: string;
    priority?: WorkOrderPriority;
    siteName?: string;
  },
): Promise<WorkOrder | null> {
  const fields: string[] = [];
  const values: unknown[] = [workOrderId, organisationId];
  let index = 3;

  for (const [key, column] of [
    ["title", "title"],
    ["description", "description"],
    ["priority", "priority"],
    ["siteName", "site_name"],
  ] as const) {
    const value = updates[key];
    if (value !== undefined) {
      fields.push(`${column} = $${index++}`);
      values.push(value);
    }
  }

  if (fields.length === 0) {
    return findWorkOrderByIdInOrg(pool, workOrderId, organisationId);
  }

  fields.push("updated_at = now()");

  const result = await pool.query<WorkOrderRow>(
    `UPDATE work_orders
     SET ${fields.join(", ")}
     WHERE id = $1 AND organisation_id = $2
     RETURNING *`,
    values,
  );

  if (!result.rowCount) {
    return null;
  }

  return mapWorkOrder(result.rows[0]);
}

export async function assignWorkOrderInTransaction(
  client: pg.PoolClient,
  workOrderId: string,
  organisationId: string,
  input: {
    assignedTechnicianId: string;
    scheduledStart: string;
    scheduledEnd: string;
  },
): Promise<WorkOrder | null> {
  const overlap = await client.query(
    `SELECT id FROM work_orders
     WHERE organisation_id = $1
       AND assigned_technician_id = $2
       AND id <> $3
       AND status NOT IN ('cancelled')
       AND scheduled_start IS NOT NULL
       AND scheduled_end IS NOT NULL
       AND tstzrange(scheduled_start, scheduled_end, '[)')
           && tstzrange($4::timestamptz, $5::timestamptz, '[)')
     FOR UPDATE`,
    [
      organisationId,
      input.assignedTechnicianId,
      workOrderId,
      input.scheduledStart,
      input.scheduledEnd,
    ],
  );

  if (overlap.rowCount && overlap.rowCount > 0) {
    throw new SchedulingOverlapError();
  }

  const result = await client.query<WorkOrderRow>(
    `UPDATE work_orders
     SET assigned_technician_id = $3,
         scheduled_start = $4,
         scheduled_end = $5,
         status = 'scheduled',
         assignment_version = assignment_version + 1,
         updated_at = now()
     WHERE id = $1 AND organisation_id = $2
     RETURNING *`,
    [
      workOrderId,
      organisationId,
      input.assignedTechnicianId,
      input.scheduledStart,
      input.scheduledEnd,
    ],
  );

  if (!result.rowCount) {
    return null;
  }

  return mapWorkOrder(result.rows[0]);
}

/** @deprecated Use assignWorkOrderInTransaction within a transaction */
export async function assignWorkOrder(
  pool: pg.Pool,
  workOrderId: string,
  organisationId: string,
  input: {
    assignedTechnicianId: string;
    scheduledStart: string;
    scheduledEnd: string;
  },
): Promise<WorkOrder | null> {
  const result = await pool.query<WorkOrderRow>(
    `UPDATE work_orders
     SET assigned_technician_id = $3,
         scheduled_start = $4,
         scheduled_end = $5,
         status = 'scheduled',
         assignment_version = assignment_version + 1,
         updated_at = now()
     WHERE id = $1 AND organisation_id = $2
     RETURNING *`,
    [
      workOrderId,
      organisationId,
      input.assignedTechnicianId,
      input.scheduledStart,
      input.scheduledEnd,
    ],
  );

  if (!result.rowCount) {
    return null;
  }

  return mapWorkOrder(result.rows[0]);
}

export async function updateWorkOrderStatus(
  pool: pg.Pool,
  workOrderId: string,
  organisationId: string,
  status: WorkOrderStatus,
): Promise<WorkOrder | null> {
  const result = await pool.query<WorkOrderRow>(
    `UPDATE work_orders
     SET status = $3, updated_at = now()
     WHERE id = $1 AND organisation_id = $2
     RETURNING *`,
    [workOrderId, organisationId, status],
  );

  if (!result.rowCount) {
    return null;
  }

  return mapWorkOrder(result.rows[0]);
}

export async function listWorkOrders(
  pool: pg.Pool,
  query: WorkOrderListQuery,
): Promise<WorkOrderListResult> {
  const { whereClause, values, sortColumn, sortOrder } =
    buildWorkOrderFilter(query);
  let index = values.length + 1;
  const offset = (query.page - 1) * query.pageSize;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM work_orders wo
     WHERE ${whereClause}`,
    values,
  );

  const listResult = await pool.query<WorkOrderRow>(
    `SELECT wo.*
     FROM work_orders wo
     WHERE ${whereClause}
     ORDER BY ${sortColumn} ${sortOrder} NULLS LAST
     LIMIT $${index++} OFFSET $${index++}`,
    [...values, query.pageSize, offset],
  );

  return {
    items: listResult.rows.map(mapWorkOrder),
    total: Number(countResult.rows[0].count),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function* iterateWorkOrdersForExport(
  pool: pg.Pool,
  query: WorkOrderFilterQuery,
): AsyncGenerator<WorkOrder> {
  const { whereClause, values, sortColumn, sortOrder } =
    buildWorkOrderFilter(query);
  const client = await pool.connect();
  const cursorName = `wo_export_${crypto.randomUUID().replace(/-/g, "")}`;

  try {
    await client.query("BEGIN");
    await client.query(
      `DECLARE ${cursorName} CURSOR FOR
       SELECT wo.*
       FROM work_orders wo
       WHERE ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder} NULLS LAST`,
      values,
    );

    while (true) {
      const batch = await client.query<WorkOrderRow>(
        `FETCH 100 FROM ${cursorName}`,
      );
      if (batch.rows.length === 0) {
        break;
      }
      for (const row of batch.rows) {
        yield mapWorkOrder(row);
      }
    }

    await client.query(`CLOSE ${cursorName}`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDashboardSummary(
  pool: pg.Pool,
  organisationId: string,
  assignedTechnicianId?: string,
): Promise<DashboardSummary> {
  const conditions = ["organisation_id = $1"];
  const values: unknown[] = [organisationId];

  if (assignedTechnicianId) {
    conditions.push("assigned_technician_id = $2");
    values.push(assignedTechnicianId);
  }

  const result = await pool.query<{ status: WorkOrderStatus; count: string }>(
    `SELECT status, COUNT(*)::text AS count
     FROM work_orders
     WHERE ${conditions.join(" AND ")}
     GROUP BY status`,
    values,
  );

  const byStatus: DashboardSummary["byStatus"] = {
    draft: 0,
    scheduled: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };

  let total = 0;
  for (const row of result.rows) {
    byStatus[row.status] = Number(row.count);
    total += Number(row.count);
  }

  return { total, byStatus };
}

export async function technicianExistsInOrg(
  pool: pg.Pool,
  technicianId: string,
  organisationId: string,
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM users
     WHERE id = $1 AND organisation_id = $2 AND role = 'technician' AND is_active = true`,
    [technicianId, organisationId],
  );
  return Boolean(result.rowCount);
}
