import { UnrecoverableError } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../infrastructure/config.js';
import { logger } from '../../infrastructure/logger.js';
import {
  INotificationProvider,
  NotificationPayload,
  NotificationResult,
  NotificationSimulationMode,
  TransientNotificationError,
} from '../types/notification.types.js';

export class MockNotificationProvider implements INotificationProvider {
  async sendAssignmentNotification(payload: NotificationPayload): Promise<NotificationResult> {
    const mode: NotificationSimulationMode =
      payload.simulationMode || config.NOTIFICATION_SIMULATION_MODE || 'always_success';

    logger.info(
      {
        workOrderId: payload.workOrderId,
        technicianId: payload.technicianId,
        organisationId: payload.organisationId,
        simulationMode: mode,
      },
      'Simulating technician assignment notification dispatch'
    );

    let effectiveMode = mode;
    if (mode === 'random') {
      const rand = Math.random();
      if (rand < 0.75) {
        effectiveMode = 'always_success';
      } else if (rand < 0.95) {
        effectiveMode = 'temporary_failure';
      } else {
        effectiveMode = 'permanent_failure';
      }
    }

    if (effectiveMode === 'temporary_failure') {
      logger.warn(
        { workOrderId: payload.workOrderId, technicianId: payload.technicianId },
        'Mock provider simulating 503 Service Unavailable (Transient Failure)'
      );
      throw new TransientNotificationError('MOCK_503_SERVICE_UNAVAILABLE');
    }

    if (effectiveMode === 'permanent_failure') {
      logger.error(
        { workOrderId: payload.workOrderId, technicianId: payload.technicianId },
        'Mock provider simulating 400 Invalid Phone Format (Permanent Failure)'
      );
      throw new UnrecoverableError('MOCK_400_INVALID_PHONE_FORMAT');
    }

    const deliveredAt = new Date();
    const messageId = `msg_${uuidv4().slice(0, 12)}`;

    logger.info(
      {
        workOrderId: payload.workOrderId,
        technicianId: payload.technicianId,
        deliveredAt: deliveredAt.toISOString(),
        messageId,
      },
      'Notification successfully dispatched via MockNotificationProvider (200 OK)'
    );

    return {
      success: true,
      provider: 'MockNotificationProvider',
      deliveredAt,
      messageId,
    };
  }
}

export const mockNotificationProvider = new MockNotificationProvider();

