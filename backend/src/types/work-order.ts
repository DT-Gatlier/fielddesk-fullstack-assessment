export type WorkOrderStatus =
  | "draft"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type WorkOrderPriority = "low" | "medium" | "high" | "urgent";

export type WorkOrder = {
  id: string;
  organisationId: string;
  createdByUserId: string;
  assignedTechnicianId: string | null;
  referenceNumber: string;
  title: string;
  description: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  siteName: string;
  assignmentVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type AuditLog = {
  id: string;
  organisationId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type WorkOrderListQuery = {
  organisationId: string;
  assignedTechnicianId?: string;
  search?: string;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
  sortBy: "created_at" | "scheduled_start" | "priority" | "status";
  sortOrder: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type WorkOrderListResult = {
  items: WorkOrder[];
  total: number;
  page: number;
  pageSize: number;
};

export type DashboardSummary = {
  total: number;
  byStatus: Record<WorkOrderStatus, number>;
};
