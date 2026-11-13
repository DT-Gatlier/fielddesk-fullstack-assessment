export type NotificationSimulationMode =
  | 'always_success'
  | 'temporary_failure'
  | 'permanent_failure'
  | 'random';

export interface NotificationPayload {
  workOrderId: string;
  technicianId: string;
  organisationId: string;
  correlationId?: string;
  simulationMode?: NotificationSimulationMode;
}

export interface NotificationResult {
  success: boolean;
  provider: string;
  deliveredAt: Date;
  messageId: string;
}

export interface INotificationProvider {
  sendAssignmentNotification(payload: NotificationPayload): Promise<NotificationResult>;
}

export class TransientNotificationError extends Error {
  constructor(message = 'MOCK_503_SERVICE_UNAVAILABLE') {
    super(message);
    this.name = 'TransientNotificationError';
  }
}

