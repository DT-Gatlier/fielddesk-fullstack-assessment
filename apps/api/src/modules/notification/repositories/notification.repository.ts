import { Injectable } from '@nestjs/common';
import type { Prisma } from '@fielddesk/database';
import { PrismaService } from '../../../database/prisma.service';
import type {
  EnqueueNotificationInput,
  NotificationPayload,
  NotificationRepositoryPort,
  OutboxRecord,
  RecordAttemptInput,
} from '../interfaces/notification.interface';

@Injectable()
export class NotificationRepository implements NotificationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueInTransaction(
    tx: Prisma.TransactionClient,
    input: EnqueueNotificationInput,
  ): Promise<void> {
    await tx.notificationOutbox.upsert({
      where: {
        organisationId_idempotencyKey: {
          organisationId: input.organisationId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: {
        organisationId: input.organisationId,
        workOrderId: input.workOrderId,
        recipientId: input.recipientId,
        channel: input.channel ?? 'SMS',
        idempotencyKey: input.idempotencyKey,
        payload: input.payload as unknown as Prisma.InputJsonValue,
        status: 'PENDING',
      },
      update: {}, // Idempotent: do nothing if already enqueued
    });
  }

  async fetchAndLockBatch(limit: number, workerId: string): Promise<OutboxRecord[]> {
    // Select candidates and acquire row-level lock using FOR UPDATE SKIP LOCKED
    // Records locked longer than 2 minutes are considered abandoned and eligible for reclamation
    const records = await this.prisma.client.$queryRaw<
      Array<{
        id: string;
        organisationId: string;
        workOrderId: string;
        recipientId: string;
        channel: string;
        idempotencyKey: string;
        payload: unknown;
        status: string;
        attemptCount: number;
        maxAttempts: number;
        nextAttemptAt: Date;
        lockedAt: Date | null;
        lockedBy: string | null;
        lastError: string | null;
        deliveredAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      WITH claimable AS (
        SELECT id
        FROM "NotificationOutbox"
        WHERE status IN ('PENDING', 'FAILED')
          AND "nextAttemptAt" <= NOW()
          AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - INTERVAL '2 minutes')
        ORDER BY "nextAttemptAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "NotificationOutbox" n
      SET "status" = 'PROCESSING',
          "lockedAt" = NOW(),
          "lockedBy" = ${workerId},
          "updatedAt" = NOW()
      FROM claimable
      WHERE n.id = claimable.id
      RETURNING n.*;
    `;

    return records.map((r) => ({
      ...r,
      channel: r.channel as OutboxRecord['channel'],
      status: r.status as OutboxRecord['status'],
      payload: r.payload as NotificationPayload,
    }));
  }

  async markDelivered(
    outboxId: string,
    attemptInput: RecordAttemptInput,
  ): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.notificationOutbox.update({
        where: { id: outboxId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });

      await tx.notificationAttempt.create({
        data: {
          outboxId,
          attemptNumber: attemptInput.attemptNumber,
          status: attemptInput.status,
          errorDetails: attemptInput.errorDetails ?? null,
          latencyMs: attemptInput.latencyMs,
        },
      });
    });
  }

  async markTransientFailure(
    outboxId: string,
    nextAttemptAt: Date,
    lastError: string,
    attemptInput: RecordAttemptInput,
  ): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.notificationOutbox.update({
        where: { id: outboxId },
        data: {
          status: 'FAILED',
          attemptCount: { increment: 1 },
          nextAttemptAt,
          lastError,
          lockedAt: null,
          lockedBy: null,
        },
      });

      await tx.notificationAttempt.create({
        data: {
          outboxId,
          attemptNumber: attemptInput.attemptNumber,
          status: attemptInput.status,
          errorDetails: attemptInput.errorDetails ?? null,
          latencyMs: attemptInput.latencyMs,
        },
      });
    });
  }

  async markPermanentFailure(
    outboxId: string,
    lastError: string,
    attemptInput: RecordAttemptInput,
  ): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.notificationOutbox.update({
        where: { id: outboxId },
        data: {
          status: 'DEAD_LETTER',
          attemptCount: { increment: 1 },
          lastError,
          lockedAt: null,
          lockedBy: null,
        },
      });

      await tx.notificationAttempt.create({
        data: {
          outboxId,
          attemptNumber: attemptInput.attemptNumber,
          status: attemptInput.status,
          errorDetails: attemptInput.errorDetails ?? null,
          latencyMs: attemptInput.latencyMs,
        },
      });
    });
  }
}
