import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  NotificationRepositoryPort,
  OutboxRecord,
} from '../interfaces/notification.interface';
import type { NotificationProviderPort } from '../providers/mock-notification.provider';
import { calculateExponentialBackoff } from '../utils/backoff';

export interface ProcessBatchResult {
  processedCount: number;
  deliveredCount: number;
  failedCount: number;
  deadLetterCount: number;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject('NotificationRepositoryPort')
    private readonly repository: NotificationRepositoryPort,
    @Inject('NotificationProviderPort')
    private readonly provider: NotificationProviderPort,
  ) {}

  /**
   * Process a single batch of pending outbox records.
   * Uses row locking with FOR UPDATE SKIP LOCKED to ensure multiple workers never clash.
   */
  async processPendingOutboxBatch(
    limit = 10,
    workerId = `worker_${process.pid}`,
  ): Promise<ProcessBatchResult> {
    const records = await this.repository.fetchAndLockBatch(limit, workerId);

    if (records.length === 0) {
      return {
        processedCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        deadLetterCount: 0,
      };
    }

    let deliveredCount = 0;
    let failedCount = 0;
    let deadLetterCount = 0;

    for (const record of records) {
      const outcome = await this.deliverSingleRecord(record);
      if (outcome === 'DELIVERED') {
        deliveredCount++;
      } else if (outcome === 'FAILED') {
        failedCount++;
      } else if (outcome === 'DEAD_LETTER') {
        deadLetterCount++;
      }
    }

    return {
      processedCount: records.length,
      deliveredCount,
      failedCount,
      deadLetterCount,
    };
  }

  private async deliverSingleRecord(
    record: OutboxRecord,
  ): Promise<'DELIVERED' | 'FAILED' | 'DEAD_LETTER'> {
    const startTime = Date.now();
    const currentAttempt = record.attemptCount + 1;

    try {
      this.logger.log(
        `[Worker] Attempting delivery #${currentAttempt} for outbox ${record.id} (WO: ${record.payload.reference}) to technician ${record.payload.technicianName}`,
      );

      const sendResult = await this.provider.send(record.payload);
      const latencyMs = Date.now() - startTime;

      if (sendResult.success) {
        await this.repository.markDelivered(record.id, {
          outboxId: record.id,
          attemptNumber: currentAttempt,
          status: 'SUCCESS',
          latencyMs,
        });

        this.logger.log(
          `[Worker] Outbox ${record.id} successfully delivered (ExternalMsgId: ${sendResult.externalMessageId}) in ${latencyMs}ms`,
        );
        return 'DELIVERED';
      }

      // Provider reported error: Check if transient or permanent
      if (sendResult.isTransient) {
        if (currentAttempt >= record.maxAttempts) {
          // Exhausted max attempts: Move to dead letter
          const errorMsg = `Max retry attempts (${record.maxAttempts}) reached. Last error: ${sendResult.errorMessage ?? 'Unknown transient failure'}`;
          await this.repository.markPermanentFailure(record.id, errorMsg, {
            outboxId: record.id,
            attemptNumber: currentAttempt,
            status: 'TRANSIENT_FAILURE',
            errorDetails: errorMsg,
            latencyMs,
          });

          this.logger.warn(
            `[Worker] Outbox ${record.id} exhausted max retries (${record.maxAttempts}). Moved to DEAD_LETTER.`,
          );
          return 'DEAD_LETTER';
        }

        // Calculate exponential backoff for next attempt
        const { nextAttemptAt, delayMs } = calculateExponentialBackoff(currentAttempt);
        const errorMsg = sendResult.errorMessage ?? 'Transient gateway error';

        await this.repository.markTransientFailure(
          record.id,
          nextAttemptAt,
          errorMsg,
          {
            outboxId: record.id,
            attemptNumber: currentAttempt,
            status: 'TRANSIENT_FAILURE',
            errorDetails: errorMsg,
            latencyMs,
          },
        );

        this.logger.warn(
          `[Worker] Outbox ${record.id} failed transiently. Scheduled retry #${currentAttempt + 1} in ${delayMs}ms (at ${nextAttemptAt.toISOString()})`,
        );
        return 'FAILED';
      }

      // Permanent failure: Do not retry, move straight to dead letter
      const permanentError = sendResult.errorMessage ?? 'Permanent non-retryable provider rejection';
      await this.repository.markPermanentFailure(record.id, permanentError, {
        outboxId: record.id,
        attemptNumber: currentAttempt,
        status: 'PERMANENT_FAILURE',
        errorDetails: permanentError,
        latencyMs,
      });

      this.logger.error(
        `[Worker] Outbox ${record.id} failed permanently: ${permanentError}. Moved to DEAD_LETTER immediately.`,
      );
      return 'DEAD_LETTER';
    } catch (unexpectedErr: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorMsg =
        unexpectedErr instanceof Error
          ? unexpectedErr.message
          : 'Unexpected runtime exception during worker dispatch';

      if (currentAttempt >= record.maxAttempts) {
        const exhaustedMsg = `Max retry attempts (${record.maxAttempts}) reached. Unexpected crash: ${errorMsg}`;
        await this.repository.markPermanentFailure(record.id, exhaustedMsg, {
          outboxId: record.id,
          attemptNumber: currentAttempt,
          status: 'TRANSIENT_FAILURE',
          errorDetails: exhaustedMsg,
          latencyMs,
        });

        this.logger.error(
          `[Worker] Outbox ${record.id} exhausted max retries (${record.maxAttempts}) on unexpected crash: ${errorMsg}. Moved to DEAD_LETTER.`,
        );
        return 'DEAD_LETTER';
      }

      // Treat unexpected code exceptions as transient and back off
      const { nextAttemptAt } = calculateExponentialBackoff(currentAttempt);
      await this.repository.markTransientFailure(record.id, nextAttemptAt, errorMsg, {
        outboxId: record.id,
        attemptNumber: currentAttempt,
        status: 'TRANSIENT_FAILURE',
        errorDetails: errorMsg,
        latencyMs,
      });

      this.logger.error(
        `[Worker] Outbox ${record.id} encountered unexpected crash: ${errorMsg}`,
      );
      return 'FAILED';
    }
  }
}
