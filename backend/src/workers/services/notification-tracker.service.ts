import { query } from '../../infrastructure/db.js';
import { logger } from '../../infrastructure/logger.js';

export interface AuditRecordParams {
  organisationId: string;
  workOrderId: string;
  technicianId: string;
  action: 'NOTIFICATION_DELIVERED' | 'NOTIFICATION_ATTEMPT_FAILED' | 'NOTIFICATION_PERMANENTLY_FAILED';
  attempt: number;
  provider?: string;
  deliveredAt?: Date;
  error?: string;
  fatal?: boolean;
  nextRetryDelay?: number;
}

export const notificationTrackerService = {
  recordAudit: async (params: AuditRecordParams): Promise<void> => {
    const metadata: Record<string, any> = {
      technicianId: params.technicianId,
      provider: params.provider || 'MockNotificationProvider',
      attempt: params.attempt,
    };

    if (params.deliveredAt) {
      metadata.deliveredAt = params.deliveredAt.toISOString();
    }
    if (params.error) {
      metadata.error = params.error;
    }
    if (params.fatal) {
      metadata.fatal = true;
    }
    if (params.nextRetryDelay) {
      metadata.nextRetryDelay = params.nextRetryDelay;
    }

    const text = `
      INSERT INTO audit_logs (
        organisation_id, actor_id, action, target_type, target_id,
        before_state, after_state, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    try {
      await query(text, [
        params.organisationId,
        null, // System background process has no actor_id
        params.action,
        'work_order',
        params.workOrderId,
        null,
        null,
        JSON.stringify(metadata),
      ]);

      logger.info(
        {
          workOrderId: params.workOrderId,
          action: params.action,
          attempt: params.attempt,
        },
        'Recorded notification attempt in audit logs'
      );
    } catch (err: any) {
      logger.error(
        { err: err.message, workOrderId: params.workOrderId, action: params.action },
        'Failed to record notification audit log entry'
      );
    }
  },
};

