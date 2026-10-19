import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import { recordAudit } from '../audit/audit.js';
import { withOrg, type DbClient, type Pool } from '../db/pool.js';
import { publishOrgEvent } from '../realtime/events.js';
import { ProviderError, type NotificationProvider } from './provider.js';
import type { NotificationJob } from './queue.js';

export type ProcessResult = 'sent' | 'retry' | 'failed' | 'skipped';

/** Thrown after the attempt has been recorded, so the queue schedules a retry with backoff. */
export class RetryableNotificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableNotificationError';
  }
}

interface NotificationRow {
  id: string;
  org_id: string;
  work_order_id: string;
  technician_id: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  email: string;
  technician_name: string;
  reference: string;
  title: string;
  site_name: string;
  scheduled_start: Date | null;
  current_technician_id: string | null;
  work_order_status: string;
}

export interface ProcessorDeps {
  pool: Pool;
  provider: NotificationProvider;
  redis: Redis;
  log: FastifyBaseLogger;
}

async function finish(
  client: DbClient,
  row: NotificationRow,
  attemptNumber: number,
  outcome: 'success' | 'temporary_failure' | 'permanent_failure',
  details: { error?: string; messageId?: string; durationMs: number; final: boolean },
): Promise<void> {
  await client.query(
    `INSERT INTO notification_attempts (org_id, notification_id, attempt_number, outcome, error, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.org_id, row.id, attemptNumber, outcome, details.error ?? null, details.durationMs],
  );

  const status = outcome === 'success' ? 'sent' : details.final ? 'failed' : 'pending';
  await client.query(
    `UPDATE notifications SET status = $2::notification_status, attempts = $3, last_error = $4, provider_message_id = $5,
       completed_at = CASE WHEN $2::notification_status = 'pending' THEN NULL ELSE now() END
     WHERE id = $1`,
    [row.id, status, attemptNumber, details.error ?? null, details.messageId ?? null],
  );

  if (status !== 'pending') {
    await recordAudit(client, {
      orgId: row.org_id,
      actor: { type: 'system' },
      action: status === 'sent' ? 'notification.sent' : 'notification.failed',
      targetType: 'work_order',
      targetId: row.work_order_id,
      after: {
        notificationId: row.id,
        technicianId: row.technician_id,
        technicianName: row.technician_name,
        attempts: attemptNumber,
        ...(details.error ? { error: details.error } : {}),
      },
      metadata: { outcome },
    });
  }
}

/**
 * Processes one notification job. Safe to run more than once for the same job (queue redelivery,
 * stalled-job recovery, the recovery sweep):
 *
 * - the notification row is locked FOR UPDATE, so two workers cannot send it concurrently;
 * - a row that is no longer 'pending' is skipped, so a completed notification is never resent;
 * - the provider receives the notification id as its idempotency key, which covers the window where
 *   the provider accepted a message but the worker crashed before committing.
 *
 * Every attempt and the final outcome are recorded in the same transaction as the status change.
 */
export async function processNotification(
  deps: ProcessorDeps,
  job: NotificationJob,
  attempt: { isFinal: boolean },
): Promise<ProcessResult> {
  const log = deps.log.child({ notificationId: job.notificationId, orgId: job.orgId });
  // Assigned inside the transaction callback; the cast stops TypeScript narrowing it to undefined.
  let target = undefined as { workOrderId: string; reference: string; technicianId: string | null } | undefined;

  const result = await withOrg(deps.pool, job.orgId, async (client): Promise<ProcessResult | { retry: string }> => {
    const { rows } = await client.query<NotificationRow>(
      `SELECT n.id, n.org_id, n.work_order_id, n.technician_id, n.status, n.attempts,
              u.email, u.name AS technician_name, wo.reference, wo.title, wo.site_name, wo.scheduled_start,
              wo.assigned_technician_id AS current_technician_id, wo.status AS work_order_status
       FROM notifications n
       JOIN users u ON u.id = n.technician_id AND u.org_id = n.org_id
       JOIN work_orders wo ON wo.id = n.work_order_id AND wo.org_id = n.org_id
       WHERE n.id = $1 AND n.org_id = $2
       FOR UPDATE OF n`,
      [job.notificationId, job.orgId],
    );
    const row = rows[0];
    if (!row) {
      log.warn('notification not found; dropping job');
      return 'skipped';
    }
    if (row.status !== 'pending') {
      log.info({ status: row.status }, 'notification already processed; skipping duplicate delivery');
      return 'skipped';
    }

    target = { workOrderId: row.work_order_id, reference: row.reference, technicianId: row.current_technician_id };
    const attemptNumber = row.attempts + 1;
    if (row.current_technician_id !== row.technician_id || row.work_order_status === 'cancelled') {
      await finish(client, row, attemptNumber, 'permanent_failure', {
        error: 'assignment superseded before delivery',
        durationMs: 0,
        final: true,
      });
      log.info('assignment superseded; notification not sent');
      return 'failed';
    }

    const startedAt = Date.now();
    try {
      const { messageId } = await deps.provider.send({
        idempotencyKey: row.id,
        to: row.email,
        subject: `New assignment ${row.reference}`,
        body: `${row.title} at ${row.site_name}${row.scheduled_start ? `, starting ${row.scheduled_start.toISOString()}` : ''}.`,
      });
      await finish(client, row, attemptNumber, 'success', { messageId, durationMs: Date.now() - startedAt, final: true });
      log.info({ attempt: attemptNumber, messageId }, 'notification sent');
      return 'sent';
    } catch (error) {
      // Anything that is not an explicit permanent rejection (timeouts, network errors, bugs in the
      // provider client) is treated as temporary and retried until attempts run out.
      const permanent = error instanceof ProviderError && error.kind === 'permanent';
      const message = (error as Error).message;
      const final = permanent || attempt.isFinal;
      await finish(client, row, attemptNumber, permanent ? 'permanent_failure' : 'temporary_failure', {
        error: message,
        durationMs: Date.now() - startedAt,
        final,
      });
      if (final) {
        log.error({ attempt: attemptNumber, err: error, permanent }, 'notification failed permanently');
        return 'failed';
      }
      log.warn({ attempt: attemptNumber, err: error }, 'notification attempt failed; will retry');
      return { retry: message };
    }
  });

  if (typeof result === 'object') throw new RetryableNotificationError(result.retry);

  if ((result === 'sent' || result === 'failed') && target) {
    // Lets open work-order pages refresh their activity history.
    await publishOrgEvent(deps.redis, job.orgId, {
      type: 'notification.updated',
      workOrderId: target.workOrderId,
      reference: target.reference,
      assignedTechnicianId: target.technicianId,
      at: new Date().toISOString(),
    }).catch((error) => log.warn({ err: error }, 'real-time publish failed'));
  }
  return result;
}
