import { describe, it, expect } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { mockNotificationProvider } from './providers/mock-notification.provider.js';
import { TransientNotificationError } from './types/notification.types.js';

describe('Worker Unit: Mock Notification Provider', () => {
  const basePayload = {
    workOrderId: 'wo-101',
    technicianId: 'tech-101',
    organisationId: 'org-apex-01',
  };

  it('delivers successfully in always_success mode', async () => {
    const result = await mockNotificationProvider.sendAssignmentNotification({
      ...basePayload,
      simulationMode: 'always_success',
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('MockNotificationProvider');
    expect(result.messageId).toMatch(/^msg-/);
  });

  it('throws TransientNotificationError in temporary_failure mode', async () => {
    await expect(
      mockNotificationProvider.sendAssignmentNotification({
        ...basePayload,
        simulationMode: 'temporary_failure',
      })
    ).rejects.toThrow(TransientNotificationError);
  });

  it('throws UnrecoverableError in permanent_failure mode', async () => {
    await expect(
      mockNotificationProvider.sendAssignmentNotification({
        ...basePayload,
        simulationMode: 'permanent_failure',
      })
    ).rejects.toThrow(UnrecoverableError);
  });
});

