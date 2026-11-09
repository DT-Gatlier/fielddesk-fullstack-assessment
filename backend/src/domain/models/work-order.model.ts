export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'urgent';
export type WorkOrderStatus = 'open' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';

export interface WorkOrder {
  id: string;
  organisationId: string;
  referenceNumber: string;
  title: string;
  description?: string | null;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  siteName: string;
  assignedTechnicianId?: string | null;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkOrderWithDetails extends WorkOrder {
  assignedTechnician?: {
    id: string;
    name: string;
    email?: string;
  } | null;
  creator?: {
    id: string;
    name: string;
  };
  attachments?: any[];
  auditLogs?: any[];
}

export interface DashboardMetrics {
  total: number;
  open: number;
  inProgress: number;
  blocked: number;
  completed: number;
}

