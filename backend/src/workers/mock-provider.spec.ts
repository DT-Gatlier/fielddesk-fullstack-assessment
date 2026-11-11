import { describe, it, expect } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { MockNotificationProvider } from './providers/mock-notification.provider.js';
import { TransientNotificationError } from './types/notification.types.js';

describe('Worker Unit: MockNotificationProvider Failure Classification', () => {
  const provider = new MockNotificationProvider();

  it('delivers 200 OK notification on always_success simulation mode', async () => {
    const res = await provider.sendAssignmentNotification({
      workOrderId: '10000000-0000-0000-0000-000000000001',
      technicianId: '11111111-1111-1111-1111-111111111103',
      organisationId: 'org-apex-01',
      simulationMode: 'always_success',
    });

    expect(res.success).toBe(true);
    expect(res.provider).toBe('MockNotificationProvider');
    expect(res.deliveredAt).toBeInstanceOf(Date);
    expect(res.messageId).toBeDefined();
  });

  it('throws TransientNotificationError (503 Service Unavailable) on temporary_failure mode', async () => {
    await expect(
      provider.sendAssignmentNotification({
        workOrderId: '10000000-0000-0000-0000-000000000001',
        technicianId: '11111111-1111-1111-1111-111111111103',
        organisationId: 'org-apex-01',
        simulationMode: 'temporary_failure',
      })
    ).rejects.toThrow(TransientNotificationError);
  });

  it('throws UnrecoverableError (400 Invalid Phone) on permanent_failure mode', async () => {
    await expect(
      provider.sendAssignmentNotification({
        workOrderId: '10000000-0000-0000-0000-000000000001',
        technicianId: '11111111-1111-1111-1111-111111111103',
        organisationId: 'org-apex-01',
        simulationMode: 'permanent_failure',
      })
    ).rejects.toThrow(UnrecoverableError);
  });
});

