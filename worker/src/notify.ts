import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { writeAudit } from '../../shared/audit';
import { config } from '../../shared/config';
import { withTransaction } from '../../shared/db';
import { publishRealtime } from '../../shared/realtime';
import { PermanentProviderError, type NotificationProvider } from './provider';

export type NotifyOutcome =
  | { kind: 'delivered'; messageId: string; duplicate: boolean }
  | { kind: 'skipped'; reason: string }
  | { kind: 'temporary_failure'; error: string; final: boolean }
  | { kind: 'permanent_failure'; error: string };

interface NotificationRow {
  id: string; org_id: string; work_order_id: string; technician_id: string; dedupe_key: string;
  recipient: string; subject: string; body: string; status: string; attempts: number;
}

/**
 * Delivers one notification. The notification row is locked FOR UPDATE for
 * the whole attempt, so two workers handling the same job (e.g. a stalled job
 * re-run by BullMQ) are serialised: the second sees status "delivered" and
 * skips. The provider additionally receives the dedupe key as an idempotency
 * key, which covers the remaining window (crash after the provider accepted
 * the message but before our COMMIT): the retry is recognised by the provider
 * and recorded as "duplicate_suppressed" instead of sending twice.
 *
 * Every attempt is recorded in notification_attempts; final outcomes are also
 * written to the audit log.
 */
export async function processNotification(args: {
  notificationId: string;
  isFinalAttempt: boolean;
  provider: NotificationProvider;
  redis: Redis;
  log: Logger;
}): Promise<NotifyOutcome> {
  const { notificationId, provider, log } = args;

  const outcome = await withTransaction(async (tx): Promise<NotifyOutcome & { row?: NotificationRow }> => {
    const { rows } = await tx.query<NotificationRow>('SELECT * FROM notifications WHERE id = $1 FOR UPDATE', [notificationId]);
    const n = rows[0];
    if (!n) return { kind: 'permanent_failure', error: 'notification record not found' };
    if (n.status === 'delivered' || n.status === 'failed') {
      return { kind: 'skipped', reason: `already ${n.status}` };
    }

    const attemptNo = n.attempts + 1;
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.NOTIFY_PROVIDER_TIMEOUT_MS);
    let result: NotifyOutcome;
    try {
      const sent = await provider.send(
        { idempotencyKey: n.dedupe_key, to: n.recipient, subject: n.subject, body: n.body },
        controller.signal,
      );
      result = { kind: 'delivered', messageId: sent.messageId, duplicate: sent.duplicate };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Anything not explicitly permanent (timeouts, network errors, unknown) is retried.
      result = err instanceof PermanentProviderError
        ? { kind: 'permanent_failure', error: message }
        : { kind: 'temporary_failure', error: message, final: args.isFinalAttempt };
    } finally {
      clearTimeout(timer);
    }
    const durationMs = Date.now() - started;

    const attemptOutcome =
      result.kind === 'delivered' ? (result.duplicate ? 'duplicate_suppressed' : 'success') : result.kind;
    await tx.query(
      `INSERT INTO notification_attempts (notification_id, attempt_no, outcome, error, duration_ms)
       VALUES ($1,$2,$3,$4,$5)`,
      [n.id, attemptNo, attemptOutcome, 'error' in result ? result.error : null, durationMs],
    );

    const terminal = result.kind === 'delivered' || result.kind === 'permanent_failure' ||
      (result.kind === 'temporary_failure' && result.final);
    const status = result.kind === 'delivered' ? 'delivered' : terminal ? 'failed' : 'retrying';
    await tx.query(
      `UPDATE notifications SET status = $2, attempts = $3, last_error = $4, provider_message_id = $5,
         completed_at = CASE WHEN $6 THEN now() ELSE NULL END
       WHERE id = $1`,
      [n.id, status, attemptNo, 'error' in result ? result.error : null,
        result.kind === 'delivered' ? result.messageId : null, terminal],
    );

    if (terminal) {
      await writeAudit(tx, {
        orgId: n.org_id, actorType: 'system', actorId: null,
        action: result.kind === 'delivered' ? 'notification.delivered' : 'notification.failed',
        targetType: 'notification', targetId: n.id, workOrderId: n.work_order_id,
        after: {
          status, attempts: attemptNo, recipient: n.recipient,
          ...(result.kind === 'delivered' ? { providerMessageId: result.messageId, duplicateSuppressed: result.duplicate } : {}),
          ...('error' in result ? { error: result.error, reason: result.kind === 'permanent_failure' ? 'permanent' : 'retries_exhausted' } : {}),
        },
      });
    }

    log.info(
      { notificationId: n.id, dedupeKey: n.dedupe_key, attemptNo, outcome: attemptOutcome, status, durationMs, ...('error' in result ? { error: result.error } : {}) },
      'notification attempt finished',
    );
    return { ...result, row: n };
  });

  if (outcome.row && outcome.kind !== 'skipped') {
    // Dispatchers' screens refresh the notification status; technicians do not receive these.
    await publishRealtime(args.redis, {
      type: 'notification.updated', orgId: outcome.row.org_id, workOrderId: outcome.row.work_order_id, technicianIds: [],
    });
  }
  if (outcome.kind === 'skipped') log.info({ notificationId, reason: outcome.reason }, 'duplicate job skipped');
  const { row: _row, ...rest } = outcome;
  return rest as NotifyOutcome;
}
