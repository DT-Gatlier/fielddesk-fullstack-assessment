export type WorkOrderPriority = "low" | "medium" | "high" | "urgent"
export type WorkOrderStatus =
  | "open"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled"

export interface WorkOrderTechnician {
  id: string
  name: string
  email: string
}

export interface WorkOrderCreator {
  id: string
  name: string
}

export interface WorkOrderAuditLog {
  id: string
  action: string
  actorId: string
  beforeState: Record<string, any> | null
  afterState: Record<string, any> | null
  createdAt: string
}

export interface WorkOrder {
  id: string
  organisationId: string
  referenceNumber: string
  title: string
  description?: string | null
  priority: WorkOrderPriority
  status: WorkOrderStatus
  siteName: string
  assignedTechnicianId?: string | null
  assignedTechnician?: WorkOrderTechnician | null
  scheduledStart?: string | null
  scheduledEnd?: string | null
  createdBy: string
  creator?: WorkOrderCreator
  attachments?: string[]
  auditLogs?: WorkOrderAuditLog[]
  createdAt: string
  updatedAt: string
}

export interface PaginatedWorkOrders {
  data: WorkOrder[]
  meta: {
    totalRecords: number
    totalPages: number
    currentPage: number
    limit: number
  }
}

export interface WorkOrderFilters {
  page?: number
  limit?: number
  status?: string
  priority?: string
  search?: string
  sortBy?: string
  sortOrder?: "ASC" | "DESC"
}

export interface CreateWorkOrderInput {
  title: string
  description?: string
  priority: WorkOrderPriority
  siteName: string
  assignedTechnicianId?: string | null
  scheduledStart?: string | null
  scheduledEnd?: string | null
}

export interface UpdateWorkOrderInput {
  title?: string
  description?: string | null
  priority?: WorkOrderPriority
  status?: WorkOrderStatus
  siteName?: string
  assignedTechnicianId?: string | null
  scheduledStart?: string | null
  scheduledEnd?: string | null
}

export interface DashboardMetrics {
  total: number
  open: number
  in_progress: number
  blocked: number
  completed: number
  cancelled: number
}

export interface TechnicianUser {
  id: string
  name: string
  email: string
}

export interface AssignTechnicianInput {
  technicianId: string
  scheduledStart: string
  scheduledEnd: string
}

export interface ConflictingWorkOrder {
  id?: string
  referenceNumber: string
  scheduledStart: string
  scheduledEnd: string
}

export interface SchedulingConflictErrorResponse {
  type: string
  title: string
  status: number
  code: string
  detail: string
  conflictingWorkOrder?: ConflictingWorkOrder
  correlationId?: string
}


