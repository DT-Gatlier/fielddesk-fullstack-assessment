import type { WorkOrderEventType } from '@fielddesk/database';

export interface WorkOrderEventSummary {
  id: string;
  eventId: string;
  organisationId: string;
  workOrderId: string;
  userId: string;
  userName: string;
  userRole: string;
  type: WorkOrderEventType;
  occurredAt: Date;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface SubmitProgressEventInput {
  eventId: string;
  type: WorkOrderEventType;
  occurredAt: Date;
  payload: {
    status?: string;
    note?: string;
    [key: string]: unknown;
  };
}

export const WORK_ORDER_EVENT_REPOSITORY = Symbol(
  'WORK_ORDER_EVENT_REPOSITORY',
);

export interface WorkOrderEventRepositoryPort {
  findByEventId(
    organisationId: string,
    eventId: string,
  ): Promise<WorkOrderEventSummary | null>;

  listByWorkOrderId(
    organisationId: string,
    workOrderId: string,
  ): Promise<WorkOrderEventSummary[]>;
}
