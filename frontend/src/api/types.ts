export type Role = 'owner' | 'dispatcher' | 'technician';
export type Status = 'open' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export const STATUSES: Status[] = ['open', 'in_progress', 'on_hold', 'completed', 'cancelled'];
export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

/** Mirrors backend TRANSITIONS; the server remains the authority. */
export const TRANSITIONS: Record<Status, Status[]> = {
  open: ['in_progress', 'on_hold', 'cancelled'],
  in_progress: ['on_hold', 'completed', 'cancelled'],
  on_hold: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};
export const TECHNICIAN_SETTABLE: Status[] = ['in_progress', 'on_hold', 'completed'];

export interface Me {
  user: { id: string; email: string; name: string; role: Role };
  organisation: { id: string; name: string };
  permissions: string[];
}

export interface WorkOrder {
  id: string;
  reference: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  siteName: string;
  technician: { id: string; name: string | null } | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  version: number;
  createdBy: { id: string; name: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: { id: string; name: string | null };
  createdAt: string;
  downloadUrl: string;
}

export interface NotificationSummary {
  id: string;
  status: 'pending' | 'enqueued' | 'retrying' | 'delivered' | 'failed';
  attempts: number;
  lastError: string | null;
  technicianName: string;
  createdAt: string;
  completedAt: string | null;
}

export interface WorkOrderDetail extends WorkOrder {
  attachments: Attachment[];
  notifications: NotificationSummary[];
}

export interface ActivityEntry {
  id: string;
  actor: { type: 'user' | 'system'; id: string | null; name: string | null };
  action: string;
  target: { type: string; id: string };
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Summary {
  total: number;
  byStatus: Record<Status, number>;
  unassigned: number;
  highPriorityActive: number;
  overdue: number;
  scheduledToday: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
}

export interface Organisation {
  id: string;
  name: string;
  storage: { limitBytes: number; usedBytes: number };
}

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
