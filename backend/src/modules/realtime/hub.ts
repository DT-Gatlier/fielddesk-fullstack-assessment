import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { logger } from '../../../../shared/logger';
import { REALTIME_CHANNEL_PREFIX, type RealtimeEvent } from '../../../../shared/realtime';

export interface RealtimeConnection {
  id: string;
  orgId: string;
  /** Set for technicians: they only receive events about work assigned to them. */
  technicianId: string | null;
  send(event: string, data: unknown): void;
  close(): void;
}

/**
 * One per API instance. A single Redis subscriber pattern-subscribes to every
 * organisation channel; each message is delivered only to local connections
 * whose server-derived orgId equals the channel's organisation. Clients never
 * choose a channel, so there is nothing to tamper with.
 */
export class RealtimeHub {
  private readonly byOrg = new Map<string, Set<RealtimeConnection>>();
  private healthy = false;

  constructor(private readonly subscriber: Redis) {}

  async start() {
    this.subscriber.on('pmessage', (_pattern, channel, message) => this.route(channel, message));
    this.subscriber.on('ready', () => this.setHealthy(true));
    this.subscriber.on('end', () => this.setHealthy(false));
    this.subscriber.on('close', () => this.setHealthy(false));
    // ioredis re-issues the PSUBSCRIBE automatically after a reconnect.
    await this.subscriber.psubscribe(`${REALTIME_CHANNEL_PREFIX}*`);
    this.setHealthy(true);
  }

  get isHealthy() {
    return this.healthy;
  }

  get connectionCount() {
    let n = 0;
    for (const set of this.byOrg.values()) n += set.size;
    return n;
  }

  /** Tells connected clients when live delivery pauses/resumes so they can fall back to refetching. */
  private setHealthy(value: boolean) {
    if (this.healthy === value) return;
    this.healthy = value;
    logger.info({ realtime: value ? 'ok' : 'degraded' }, 'realtime subscriber state changed');
    for (const set of this.byOrg.values()) for (const c of set) c.send('status', { realtime: value ? 'ok' : 'degraded' });
  }

  private route(channel: string, message: string) {
    const channelOrg = channel.slice(REALTIME_CHANNEL_PREFIX.length);
    let event: RealtimeEvent;
    try {
      event = JSON.parse(message) as RealtimeEvent;
    } catch {
      logger.warn({ channel }, 'dropping malformed realtime message');
      return;
    }
    // Defence in depth: the payload must agree with the channel it arrived on.
    if (event.orgId !== channelOrg) {
      logger.error({ channel, eventOrg: event.orgId }, 'realtime org mismatch; message dropped');
      return;
    }
    const targets = this.byOrg.get(channelOrg);
    if (!targets) return;
    const outbound = {
      type: event.type, workOrderId: event.workOrderId, reference: event.reference, status: event.status, at: event.at,
    };
    for (const conn of targets) {
      if (conn.orgId !== channelOrg) continue;
      if (conn.technicianId && !event.technicianIds.includes(conn.technicianId)) continue;
      conn.send('work_order', outbound);
    }
  }

  add(conn: Omit<RealtimeConnection, 'id'>): RealtimeConnection {
    const full = { ...conn, id: randomUUID() };
    let set = this.byOrg.get(full.orgId);
    if (!set) this.byOrg.set(full.orgId, (set = new Set()));
    set.add(full);
    return full;
  }

  remove(conn: RealtimeConnection) {
    const set = this.byOrg.get(conn.orgId);
    if (!set) return;
    set.delete(conn);
    if (set.size === 0) this.byOrg.delete(conn.orgId);
  }

  /** Graceful shutdown: tell clients to reconnect (to another instance) and close. */
  async stop() {
    for (const set of this.byOrg.values()) {
      for (const c of set) {
        c.send('status', { realtime: 'reconnect' });
        c.close();
      }
    }
    this.byOrg.clear();
    await this.subscriber.quit().catch(() => this.subscriber.disconnect());
  }
}
