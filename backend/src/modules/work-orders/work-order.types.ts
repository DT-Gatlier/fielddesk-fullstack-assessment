import type {
  WorkOrderPriority,
  WorkOrderStatus,
} from "@prisma/client";

export interface CreateWorkOrderInput {
  referenceNumber: string;
  title: string;
  description?: string;
  priority: WorkOrderPriority;
  status?: WorkOrderStatus;
  assignedTechnicianId?: string;
  scheduledStart?: Date;
  scheduledEnd?: Date;
  siteName: string;
}

export interface UpdateWorkOrderInput {
  title?: string;
  description?: string | null;
  priority?: WorkOrderPriority;
  status?: WorkOrderStatus;
  assignedTechnicianId?: string | null;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  siteName?: string;
}

export interface WorkOrderListQuery {
  search?: string;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
  assignedTechnicianId?: string;
  page: number;
  limit: number;
  sortBy: "createdAt" | "scheduledStart" | "priority" | "status";
  sortOrder: "asc" | "desc";
}