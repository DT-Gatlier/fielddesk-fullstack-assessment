export interface CreateAuditLogInput {
  organisationId: string;
  actorId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  workOrderId?: string;
  beforeData?: unknown;
  afterData?: unknown;
}