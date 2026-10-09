import { NotificationService } from './notification.service';
import { MockNotificationProvider } from '../providers/mock-notification.provider';
import type {
  NotificationRepositoryPort,
  OutboxRecord,
} from '../interfaces/notification.interface';

describe('NotificationService (Background Worker Engine)', () => {
  let service: NotificationService;
  let mockProvider: MockNotificationProvider;

  let enqueueInTransactionMock: jest.Mock;
  let fetchAndLockBatchMock: jest.Mock;
  let markDeliveredMock: jest.Mock;
  let markTransientFailureMock: jest.Mock;
  let markPermanentFailureMock: jest.Mock;

  let mockRepo: NotificationRepositoryPort;

  const sampleOutboxRecord: OutboxRecord = {
    id: 'outbox-1',
    organisationId: 'org-1',
    workOrderId: 'wo-1',
    recipientId: 'tech-1',
    channel: 'SMS',
    idempotencyKey: 'wo_assign_123',
    payload: {
      workOrderId: 'wo-1',
      reference: 'WO-0001',
      title: 'AC Fix',
      siteName: 'Main Site',
      technicianId: 'tech-1',
      technicianName: 'Rahul Sharma',
      scheduledStart: new Date().toISOString(),
      scheduledEnd: new Date().toISOString(),
      assignedByUserId: 'user-admin',
    },
    status: 'PENDING',
    attemptCount: 0,
    maxAttempts: 3,
    nextAttemptAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    deliveredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockProvider = new MockNotificationProvider();

    enqueueInTransactionMock = jest.fn();
    fetchAndLockBatchMock = jest.fn();
    markDeliveredMock = jest.fn();
    markTransientFailureMock = jest.fn();
    markPermanentFailureMock = jest.fn();

    mockRepo = {
      enqueueInTransaction: enqueueInTransactionMock,
      fetchAndLockBatch: fetchAndLockBatchMock,
      markDelivered: markDeliveredMock,
      markTransientFailure: markTransientFailureMock,
      markPermanentFailure: markPermanentFailureMock,
    };

    service = new NotificationService(mockRepo, mockProvider);
  });

  it('successfully delivers pending notification and records success outcome', async () => {
    fetchAndLockBatchMock.mockResolvedValue([sampleOutboxRecord]);
    mockProvider.setBehavior('ALWAYS_SUCCEED');

    const result = await service.processPendingOutboxBatch(10, 'worker-test');

    expect(result.processedCount).toBe(1);
    expect(result.deliveredCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.deadLetterCount).toBe(0);

    expect(markDeliveredMock).toHaveBeenCalledWith(
      'outbox-1',
      expect.objectContaining({
        outboxId: 'outbox-1',
        attemptNumber: 1,
        status: 'SUCCESS',
      }),
    );
  });

  it('handles transient provider failure by scheduling exponential backoff retry', async () => {
    fetchAndLockBatchMock.mockResolvedValue([sampleOutboxRecord]);
    mockProvider.setBehavior('FAIL_TRANSIENT');

    const result = await service.processPendingOutboxBatch(10, 'worker-test');

    expect(result.processedCount).toBe(1);
    expect(result.deliveredCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.deadLetterCount).toBe(0);

    expect(markTransientFailureMock).toHaveBeenCalledWith(
      'outbox-1',
      expect.any(Date),
      expect.stringContaining('503 Gateway Timeout'),
      expect.objectContaining({
        attemptNumber: 1,
        status: 'TRANSIENT_FAILURE',
      }),
    );
  });

  it('moves directly to DEAD_LETTER when encountering a permanent non-retryable rejection', async () => {
    fetchAndLockBatchMock.mockResolvedValue([sampleOutboxRecord]);
    mockProvider.setBehavior('FAIL_PERMANENT');

    const result = await service.processPendingOutboxBatch(10, 'worker-test');

    expect(result.processedCount).toBe(1);
    expect(result.deliveredCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.deadLetterCount).toBe(1);

    expect(markPermanentFailureMock).toHaveBeenCalledWith(
      'outbox-1',
      expect.stringContaining('400 Bad Request'),
      expect.objectContaining({
        attemptNumber: 1,
        status: 'PERMANENT_FAILURE',
      }),
    );
  });

  it('moves to DEAD_LETTER after exhausting maximum retry attempts', async () => {
    const exhaustedRecord: OutboxRecord = {
      ...sampleOutboxRecord,
      attemptCount: 2, // Next attempt is 3 (maxAttempts: 3)
    };

    fetchAndLockBatchMock.mockResolvedValue([exhaustedRecord]);
    mockProvider.setBehavior('FAIL_TRANSIENT');

    const result = await service.processPendingOutboxBatch(10, 'worker-test');

    expect(result.processedCount).toBe(1);
    expect(result.deliveredCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.deadLetterCount).toBe(1);

    expect(markPermanentFailureMock).toHaveBeenCalledWith(
      'outbox-1',
      expect.stringContaining('Max retry attempts (3) reached'),
      expect.objectContaining({
        attemptNumber: 3,
        status: 'TRANSIENT_FAILURE',
      }),
    );
  });

  it('moves to DEAD_LETTER when unexpected runtime exception occurs and maxAttempts reached', async () => {
    const exhaustedRecord: OutboxRecord = {
      ...sampleOutboxRecord,
      attemptCount: 2, // Next attempt is 3
    };

    fetchAndLockBatchMock.mockResolvedValue([exhaustedRecord]);
    mockProvider.send = jest.fn().mockRejectedValue(new Error('Fatal socket crash'));

    const result = await service.processPendingOutboxBatch(10, 'worker-test');

    expect(result.processedCount).toBe(1);
    expect(result.deliveredCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.deadLetterCount).toBe(1);

    expect(markPermanentFailureMock).toHaveBeenCalledWith(
      'outbox-1',
      expect.stringContaining('Fatal socket crash'),
      expect.objectContaining({
        attemptNumber: 3,
        status: 'TRANSIENT_FAILURE',
      }),
    );
  });
});
