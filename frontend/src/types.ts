export type Role = 'owner' | 'dispatcher' | 'technician';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type WorkOrderStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  organisationId: string;
  organisationName?: string;
  organisationSlug?: string;
}

export interface WorkOrder {
  id: string;
  referenceNumber: string;
  title: string;
  description: string;
  priority: Priority;
  status: WorkOrderStatus;
  assignedTechnicianId: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  siteName: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment { id: string; originalName: string; contentType: string; sizeBytes: number; createdAt: string }
export interface HistoryEntry { action: string; actorUserId: string | null; before: unknown; after: unknown; metadata: unknown; createdAt: string }
export interface ProgressEvent { eventId: string; type: string; occurredAt: string; payload: Record<string, unknown>; createdAt: string }
export interface WorkOrderDetail extends WorkOrder { attachments: Attachment[]; history: HistoryEntry[]; progressEvents: ProgressEvent[] }
export interface PaginationMeta { page: number; limit: number; total: number }
export interface ListResponse<T> { data: T[]; meta: PaginationMeta }
export interface ApiResponse<T> { data: T }
export interface ApiErrorBody { error: { code: string; message: string; details?: unknown }; requestId?: string }
export interface SelectOption { id: string; value: string }

export interface DashboardData {
  statusCounts: Partial<Record<WorkOrderStatus, number>>;
  priorityCounts: Partial<Record<Priority, number>>;
  upcoming: WorkOrder[];
  storage: { usedBytes: number; limitBytes: number };
}

export interface WorkOrderInput {
  referenceNumber: string;
  title: string;
  description: string;
  priority: Priority;
  status: WorkOrderStatus;
  assignedTechnicianId: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  siteName: string;
}
