import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type { WebSocket } from 'ws';
import type { AuthContext } from '../auth/sessions.js';
import { ORG_CHANNEL_PREFIX, type RealtimeEvent } from './events.js';

export interface RealtimeClient {
  socket: WebSocket;
  auth: AuthContext;
  alive: boolean;
}

/** Technicians only hear about work orders that are, or just stopped being, assigned to them. */
export function visibleTo(auth: AuthContext, event: RealtimeEvent): boolean {
  if (auth.role !== 'technician') return true;
  return event.assignedTechnicianId === auth.userId || event.previousTechnicianId === auth.userId;
}

/**
 * Fans Redis pub/sub messages out to this instance's sockets. Sockets are indexed by the organisation
 * taken from their authenticated session, and a message is only ever looked up by the organisation in
 * its channel name, so one tenant's events cannot reach another tenant's sockets.
 */
export class RealtimeHub {
  private readonly clients = new Map<string, Set<RealtimeClient>>();

  constructor(
    private readonly subscriber: Redis,
    private readonly log: FastifyBaseLogger,
  ) {}

  async start(): Promise<void> {
    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      this.deliver(channel.slice(ORG_CHANNEL_PREFIX.length), message);
    });
    await this.subscriber.psubscribe(`${ORG_CHANNEL_PREFIX}*`);
  }

  add(client: RealtimeClient): void {
    const set = this.clients.get(client.auth.orgId) ?? new Set();
    set.add(client);
    this.clients.set(client.auth.orgId, set);
  }

  remove(client: RealtimeClient): void {
    const set = this.clients.get(client.auth.orgId);
    set?.delete(client);
    if (set?.size === 0) this.clients.delete(client.auth.orgId);
  }

  get connectionCount(): number {
    let count = 0;
    for (const set of this.clients.values()) count += set.size;
    return count;
  }

  private deliver(orgId: string, message: string): void {
    const set = this.clients.get(orgId);
    if (!set) return;
    let event: RealtimeEvent;
    try {
      event = JSON.parse(message) as RealtimeEvent;
    } catch {
      this.log.warn({ orgId }, 'discarding malformed real-time message');
      return;
    }
    for (const client of set) {
      if (client.auth.orgId !== orgId || !visibleTo(client.auth, event)) continue;
      if (client.socket.readyState === client.socket.OPEN) client.socket.send(message);
    }
  }

  async close(): Promise<void> {
    for (const set of this.clients.values()) {
      for (const client of set) client.socket.close(1001, 'server shutting down');
    }
    this.clients.clear();
    await this.subscriber.quit().catch(() => undefined);
  }
}
