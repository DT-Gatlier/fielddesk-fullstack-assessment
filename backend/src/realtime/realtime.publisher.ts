import { getRedisClient } from '../infrastructure/redis.js';
import { logger } from '../infrastructure/logger.js';
import { sseManager } from './sse-manager.js';

export async function publishRealtimeEvent(
  orgId: string,
  eventOrName: string | Record<string, any>,
  data?: any
): Promise<void> {
  let eventName: string;
  let payload: any;

  if (typeof eventOrName === 'string') {
    eventName = eventOrName;
    payload = data;
  } else {
    eventName = eventOrName.type?.toLowerCase() || 'work_order_updated';
    payload = eventOrName;
  }

  // 1. Broadcast directly to SSE sockets for this tenant
  sseManager.broadcastToOrg(orgId, eventName, payload);

  // 2. Publish to Redis channel for multi-pod horizontal scalability
  const channel = `realtime:events:${orgId}`;
  try {
    const client = getRedisClient();
    await client.publish(channel, JSON.stringify({ eventName, data: payload }));
  } catch (err: any) {
    logger.warn({ err: err.message, orgId }, 'Redis publish skipped or unavailable');
  }

  logger.info(
    { orgId, eventName, type: payload?.type, workOrderId: payload?.workOrderId },
    'Published real-time event to SSE and Redis'
  );
}
