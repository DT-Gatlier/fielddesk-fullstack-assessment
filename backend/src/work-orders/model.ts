export const STATUSES = ['open', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled'] as const;
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

/** Allowed status changes. Completed is final; a cancelled order can be reopened. */
const TRANSITIONS: Record<Status, readonly Status[]> = {
  open: ['scheduled', 'in_progress', 'on_hold', 'cancelled'],
  scheduled: ['open', 'in_progress', 'on_hold', 'cancelled'],
  in_progress: ['on_hold', 'completed', 'cancelled'],
  on_hold: ['scheduled', 'in_progress', 'cancelled'],
  completed: [],
  cancelled: ['open'],
};

export function canTransition(from: Status, to: Status): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export interface WorkOrderRow {
  id: string;
  org_id: string;
  reference: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  site_name: string;
  assigned_technician_id: string | null;
  technician_name: string | null;
  scheduled_start: Date | null;
  scheduled_end: Date | null;
  created_by: string;
  created_by_name: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export const WORK_ORDER_COLUMNS = `
  wo.id, wo.org_id, wo.reference, wo.title, wo.description, wo.priority, wo.status, wo.site_name,
  wo.assigned_technician_id, t.name AS technician_name, wo.scheduled_start, wo.scheduled_end,
  wo.created_by, c.name AS created_by_name, wo.version, wo.created_at, wo.updated_at`;

export const WORK_ORDER_FROM = `
  FROM work_orders wo
  LEFT JOIN users t ON t.id = wo.assigned_technician_id AND t.org_id = wo.org_id
  JOIN users c ON c.id = wo.created_by AND c.org_id = wo.org_id`;

export function toWorkOrder(row: WorkOrderRow) {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    siteName: row.site_name,
    assignedTechnician: row.assigned_technician_id
      ? { id: row.assigned_technician_id, name: row.technician_name }
      : null,
    scheduledStart: row.scheduled_start?.toISOString() ?? null,
    scheduledEnd: row.scheduled_end?.toISOString() ?? null,
    createdBy: { id: row.created_by, name: row.created_by_name },
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export type WorkOrder = ReturnType<typeof toWorkOrder>;

/** The editable fields, as recorded in audit before/after snapshots. */
export function auditFields(row: WorkOrderRow) {
  return {
    title: row.title,
    description: row.description,
    priority: row.priority,
    siteName: row.site_name,
    scheduledStart: row.scheduled_start?.toISOString() ?? null,
    scheduledEnd: row.scheduled_end?.toISOString() ?? null,
  };
}
