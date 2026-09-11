export type ProgressEventType = "status_changed" | "note_added";

export type ProgressEvent = {
  id: string;
  organisationId: string;
  workOrderId: string;
  submittedByUserId: string;
  eventId: string;
  eventType: ProgressEventType;
  occurredAt: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type SubmitProgressEventInput = {
  eventId: string;
  workOrderId: string;
  type: ProgressEventType;
  occurredAt: string;
  payload: Record<string, unknown>;
};
