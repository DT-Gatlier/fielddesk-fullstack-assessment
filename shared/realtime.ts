import type { Redis } from 'ioredis';
import { logger } from './logger';

/**
 * Real-time events are published on one Redis channel per organisation.
 * Every API instance pattern-subscribes and forwards a message only to SSE
 * connections whose authenticated organisation matches the channel.
 */
export const REALTIME_CHANNEL_PREFIX = 'fd:rt:org:';
export const realtimeChannel = (orgId: string) => `${REALTIME_CHANNEL_PREFIX}${orgId}`;

export type RealtimeEventType =
  | 'work_order.created'
  | 'work_order.updated'
  | 'work_order.assignment_changed'
  | 'work_order.status_changed'
  | 'attachment.added'
  | 'notification.updated';

export interface RealtimeEvent {
  type: RealtimeEventType;
  orgId: string;
  workOrderId: string;
  reference?: string;
  status?: string;
  /**
   * Technicians this change concerns (old and new assignee). Technician
   * connections only receive events listing them.
   */
  technicianIds: string[];
  at: string;
}

/**
 * Best-effort publish after the database transaction has committed. A failure
 * here never fails the request: the database is the source of truth and
 * clients refetch on reconnect.
 */
export async function publishRealtime(redis: Redis, event: Omit<RealtimeEvent, 'at'>): Promise<void> {
  const full: RealtimeEvent = { ...event, at: new Date().toISOString() };
  try {
    await redis.publish(realtimeChannel(event.orgId), JSON.stringify(full));
  } catch (err) {
    logger.warn({ err, event: full.type, workOrderId: full.workOrderId }, 'realtime publish failed');
  }
}
