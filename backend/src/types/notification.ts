export type NotificationStatus =
  | "pending"
  | "sent"
  | "failed_transient"
  | "failed_permanent";

export type NotificationDelivery = {
  id: string;
  organisationId: string;
  workOrderId: string;
  technicianId: string;
  assignmentVersion: number;
  status: NotificationStatus;
  attemptCount: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationJobPayload = {
  workOrderId: string;
  technicianId: string;
  organisationId: string;
  assignmentVersion: number;
  correlationId?: string;
};
