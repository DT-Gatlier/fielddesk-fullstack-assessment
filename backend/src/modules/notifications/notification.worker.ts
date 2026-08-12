import { Queue, Worker, UnrecoverableError, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { Config } from '../../config.js';
import type { Database } from '../../database/pool.js';
import type { RuntimeServices } from '../../infrastructure/runtime.js';

interface NotificationData { jobId: string; baseAttemptCount: number }

export class TemporaryProviderError extends Error {}
export class PermanentProviderError extends Error {}

export async function mockNotify(mode: Config['MOCK_NOTIFICATION_MODE'], attempt: number): Promise<void> {
  if (mode === 'permanent_failure') throw new PermanentProviderError('Mock provider rejected the recipient permanently');
  if (mode === 'temporary_failure') throw new TemporaryProviderError('Mock provider is temporarily unavailable');
  if (mode === 'flaky' && attempt < 3) throw new TemporaryProviderError('Mock transient failure');
}

export class NotificationWorkerService {
  private readonly connection: Redis;
  private readonly queue: Queue<NotificationData>;
  private readonly worker: Worker<NotificationData>;
  private poller?: NodeJS.Timeout;
  private polling = false;

  constructor(private readonly database: Database, private readonly config: Config, private readonly runtime: RuntimeServices) {
    this.connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue(config.NOTIFICATION_QUEUE_NAME, { connection: this.connection });
    this.worker = new Worker(config.NOTIFICATION_QUEUE_NAME, (job) => this.process(job), {
      connection: this.connection, concurrency: 10, lockDuration: 30_000
    });
    this.worker.on('error', (error) => console.error(JSON.stringify({ level: 'error', message: 'notification worker error', error: error.message })));
  }

  start() {
    this.poller = setInterval(() => void this.dispatchOutbox(), this.config.OUTBOX_POLL_MS);
    this.poller.unref();
    void this.dispatchOutbox();
  }

  async dispatchOutbox() {
    if (this.polling) return;
    this.polling = true;
    try {
      const result = await this.database.query<{ id: string; attempt_count: number }>(`SELECT id, attempt_count FROM notification_jobs WHERE (status = 'pending' AND next_attempt_at <= now()) OR (status = 'processing' AND updated_at < now() - interval '5 minutes') ORDER BY created_at LIMIT 100`);
      for (const row of result.rows) {
        const existing = await this.queue.getJob(row.id);
        let shouldAdd = !existing;
        if (existing) {
          const state = await existing.getState();
          if (state === 'failed' || state === 'completed') { await existing.remove(); shouldAdd = true; }
        }
        if (shouldAdd) {
          await this.queue.add('notify-technician', { jobId: row.id, baseAttemptCount: Number(row.attempt_count) }, {
            jobId: row.id, attempts: this.config.NOTIFICATION_MAX_ATTEMPTS,
            backoff: { type: 'exponential', delay: this.config.NOTIFICATION_BACKOFF_MS }, removeOnComplete: 500, removeOnFail: 1000
          });
        }
        await this.database.query(`UPDATE notification_jobs SET status = 'processing', updated_at = now() WHERE id = $1 AND status IN ('pending', 'processing')`, [row.id]);
      }
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', message: 'outbox dispatch failed', error: (error as Error).message }));
    } finally { this.polling = false; }
  }

  private async process(job: Job<NotificationData>) {
    const claimed = await this.database.query(`SELECT j.id, j.organisation_id, j.work_order_id, j.technician_id, j.status, j.attempt_count, u.email, u.name, w.reference_number, w.title FROM notification_jobs j JOIN users u ON u.organisation_id = j.organisation_id AND u.id = j.technician_id JOIN work_orders w ON w.organisation_id = j.organisation_id AND w.id = j.work_order_id WHERE j.id = $1`, [job.data.jobId]);
    const data = claimed.rows[0];
    if (!data || data.status === 'delivered' || data.status === 'permanent_failure') return;
    const attempt = job.data.baseAttemptCount + job.attemptsMade + 1;
    try {
      await mockNotify(this.config.MOCK_NOTIFICATION_MODE, attempt);
      await this.recordOutcome(data, attempt, 'delivered');
      await this.runtime.publish(data.organisation_id, 'notification.delivered', { jobId: data.id, workOrderId: data.work_order_id });
    } catch (error) {
      const permanent = error instanceof PermanentProviderError;
      const exhausted = job.attemptsMade + 1 >= this.config.NOTIFICATION_MAX_ATTEMPTS;
      const outcome = permanent || exhausted ? 'permanent_failure' : 'temporary_failure';
      await this.recordOutcome(data, attempt, outcome, (error as Error).message);
      await this.runtime.publish(data.organisation_id, `notification.${outcome}`, { jobId: data.id, workOrderId: data.work_order_id, attempt, error: (error as Error).message });
      if (permanent) throw new UnrecoverableError((error as Error).message);
      if (!exhausted) throw error;
    }
  }

  private async recordOutcome(data: Record<string, string>, attempt: number, outcome: string, message?: string) {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO notification_attempts (job_id, attempt_number, outcome, error_message) VALUES ($1, $2, $3, $4) ON CONFLICT (job_id, attempt_number) DO NOTHING`, [data.id, attempt, outcome, message ?? null]);
      const status = outcome === 'delivered' ? 'delivered' : outcome === 'permanent_failure' ? 'permanent_failure' : 'processing';
      const delayMs = this.config.NOTIFICATION_BACKOFF_MS * (2 ** Math.max(0, attempt - 1));
      await client.query(`UPDATE notification_jobs SET status = $2, attempt_count = GREATEST(attempt_count, $3), last_error = $4, next_attempt_at = CASE WHEN $2 = 'processing' THEN now() + ($5 * interval '1 millisecond') ELSE next_attempt_at END, delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END, updated_at = now() WHERE id = $1`, [data.id, status, attempt, message ?? null, delayMs]);
      await client.query(`INSERT INTO audit_entries (organisation_id, action, target_type, target_id, after_data, metadata) VALUES ($1, $2, 'work_order', $3, $4, $5)`, [data.organisation_id, `notification.${outcome}`, data.work_order_id, { attempt, error: message }, { notificationJobId: data.id }]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async close() {
    if (this.poller) clearInterval(this.poller);
    await Promise.allSettled([this.worker.close(), this.queue.close(), this.connection.quit()]);
  }
}
