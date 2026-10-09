import type { WorkOrderPriority, WorkOrderStatus } from '@fielddesk/database';

export interface WorkOrderSummary {
  id: string;
  organisationId: string;
  reference: string;
  title: string;
  description: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  siteName: string;
  creatorId: string;
  creatorName: string;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkOrderInput {
  title: string;
  description: string;
  priority?: WorkOrderPriority;
  siteName: string;
  assignedTechnicianId?: string;
  scheduledStart?: Date;
  scheduledEnd?: Date;
}

export interface UpdateWorkOrderInput {
  title?: string;
  description?: string;
  priority?: WorkOrderPriority;
  siteName?: string;
}

export interface AssignWorkOrderInput {
  assignedTechnicianId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
}

export interface UpdateWorkOrderStatusInput {
  status: WorkOrderStatus;
}

export interface WorkOrderFilterInput {
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
  assignedTechnicianId?: string;
  search?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedWorkOrders {
  items: WorkOrderSummary[];
  total: number;
  page: number;
  limit: number;
}
