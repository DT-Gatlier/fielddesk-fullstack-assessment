export type RealtimeEventType =
  | 'WORK_ORDER_CREATED'
  | 'WORK_ORDER_UPDATED'
  | 'WORK_ORDER_ASSIGNED'
  | 'WORK_ORDER_UNASSIGNED'
  | 'WORK_ORDER_STATUS_CHANGED'
  | 'PROGRESS_EVENT_ADDED'
  | 'ATTACHMENT_ADDED'
  | 'ATTACHMENT_DELETED';

export interface RealtimeEventPayload<T = unknown> {
  id: string;
  type: RealtimeEventType;
  organisationId: string;
  workOrderId: string;
  assignedTechnicianId?: string | null;
  reference?: string;
  occurredAt: string;
  data?: T;
}

export interface RealtimeServerEvent {
  id: string;
  type: string;
  data: string;
  retry?: number;
}
