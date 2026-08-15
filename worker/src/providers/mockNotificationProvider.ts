import { config } from '../config';
import { logger } from '../utils/logger';

export interface NotificationResult {
  success: boolean;
  temporary: boolean;
  reason?: string;
}

export class MockNotificationProvider {
  /**
   * Simulates an external provider API call.
   * Based on configured failure rates, it will randomly succeed, temporarily fail, or permanently fail.
   */
  static async sendNotification(technicianId: string, workOrderId: string): Promise<NotificationResult> {
    logger.info({ technicianId, workOrderId }, 'Calling mock provider API...');
    
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 500 + 200));

    const rand = Math.random();

    if (rand < config.mockProvider.permanentFailureRate) {
      logger.warn({ technicianId, workOrderId }, 'Mock provider: Permanent failure (e.g., Invalid email)');
      return { success: false, temporary: false, reason: 'Invalid recipient address' };
    }

    if (rand < config.mockProvider.failureRate + config.mockProvider.permanentFailureRate) {
      logger.warn({ technicianId, workOrderId }, 'Mock provider: Temporary failure (e.g., Timeout)');
      return { success: false, temporary: true, reason: 'Provider API timeout' };
    }

    logger.info({ technicianId, workOrderId }, 'Mock provider: Success');
    return { success: true, temporary: false };
  }
}
