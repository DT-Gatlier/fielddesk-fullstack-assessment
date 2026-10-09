import type { Prisma } from '@fielddesk/database';

export type NotificationChannel = 'SMS' | 'EMAIL' | 'PUSH';
export type NotificationOutboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'DELIVERED'
  | 'FAILED'
  | 'DEAD_LETTER';

export interface NotificationPayload {
  workOrderId: string;
  reference: string;
  title: string;
  siteName: string;
  technicianId: string;
  technicianName: string;
  scheduledStart: string;
  scheduledEnd: string;
  assignedByUserId: string;
}

export interface EnqueueNotificationInput {
  organisationId: string;
  workOrderId: string;
  recipientId: string;
  channel?: NotificationChannel;
  idempotencyKey: string;
  payload: NotificationPayload;
}

export interface OutboxRecord {
  id: string;
  organisationId: string;
  workOrderId: string;
  recipientId: string;
  channel: NotificationChannel;
  idempotencyKey: string;
  payload: NotificationPayload;
  status: NotificationOutboxStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecordAttemptInput {
  outboxId: string;
  attemptNumber: number;
  status: 'SUCCESS' | 'TRANSIENT_FAILURE' | 'PERMANENT_FAILURE';
  errorDetails?: string | null;
  latencyMs: number;
}

export interface NotificationRepositoryPort {
  /**
   * Enqueue outbox record inside an existing Prisma transaction.
   * If the idempotency key already exists for the organisation, it is safely ignored.
   */
  enqueueInTransaction(
    tx: Prisma.TransactionClient,
    input: EnqueueNotificationInput,
  ): Promise<void>;

  /**
   * Concurrently safe poll & lock pending records using `FOR UPDATE SKIP LOCKED`.
   */
  fetchAndLockBatch(limit: number, workerId: string): Promise<OutboxRecord[]>;

  /**
   * Release lock and mark delivery success.
   */
  markDelivered(
    outboxId: string,
    attemptInput: RecordAttemptInput,
  ): Promise<void>;

  /**
   * Record transient failure, increment attempt count, set nextAttemptAt with backoff.
   */
  markTransientFailure(
    outboxId: string,
    nextAttemptAt: Date,
    lastError: string,
    attemptInput: RecordAttemptInput,
  ): Promise<void>;

  /**
   * Record permanent failure or max attempts exhausted -> mark DEAD_LETTER.
   */
  markPermanentFailure(
    outboxId: string,
    lastError: string,
    attemptInput: RecordAttemptInput,
  ): Promise<void>;
}
