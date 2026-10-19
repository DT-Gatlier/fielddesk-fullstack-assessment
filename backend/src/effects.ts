import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type { NotificationJob, NotificationQueue } from './notifications/queue.js';
import { publishOrgEvent, type RealtimeEvent } from './realtime/events.js';

/**
 * Side effects that must only happen after the database transaction commits: a job for a rolled-back
 * assignment, or a live update for a change that never happened, would be wrong.
 *
 * Neither is required for correctness. A notification row is committed with status 'pending', and the
 * worker's recovery sweep enqueues any that were never queued. Real-time messages are hints; clients
 * refetch on reconnect and poll while disconnected.
 */
export class Effects {
  readonly notifications: NotificationJob[] = [];
  readonly events: Array<{ orgId: string; event: RealtimeEvent }> = [];

  notify(job: NotificationJob): void {
    this.notifications.push(job);
  }

  publish(orgId: string, event: RealtimeEvent): void {
    this.events.push({ orgId, event });
  }

  async dispatch(deps: { queue: NotificationQueue; redis: Redis; log: FastifyBaseLogger }): Promise<void> {
    for (const job of this.notifications) {
      try {
        await deps.queue.enqueue(job);
        deps.log.info({ notificationId: job.notificationId }, 'notification enqueued');
      } catch (error) {
        deps.log.warn({ err: error, notificationId: job.notificationId }, 'enqueue failed; recovery sweep will retry');
      }
    }
    for (const { orgId, event } of this.events) {
      try {
        await publishOrgEvent(deps.redis, orgId, event);
      } catch (error) {
        deps.log.warn({ err: error, type: event.type }, 'real-time publish failed');
      }
    }
  }
}
