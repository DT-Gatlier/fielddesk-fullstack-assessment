export type RealtimeEventType =
  | 'WORK_ORDER_CREATED'
  | 'WORK_ORDER_UPDATED'
  | 'WORK_ORDER_ASSIGNED'
  | 'WORK_ORDER_UNASSIGNED'
  | 'WORK_ORDER_STATUS_CHANGED'
  | 'PROGRESS_EVENT_ADDED'
  | 'ATTACHMENT_ADDED'
  | 'ATTACHMENT_DELETED'
  | 'ping';

export interface RealtimeEventPayload<T = unknown> {
  id: string;
  type: RealtimeEventType;
  organisationId: string;
  workOrderId: string;
  reference?: string;
  assignedTechnicianId?: string | null;
  occurredAt: string;
  data: T;
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';
