import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { merge, Observable, timer } from 'rxjs';
import { filter, map } from 'rxjs/operators';

import { RedisPubSubService } from '../../../infrastructure/redis/redis-pubsub.service';
import type {
  RealtimeEventPayload,
  RealtimeServerEvent,
} from '../interfaces/realtime.interface';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private readonly pubSub: RedisPubSubService) {}

  /**
   * Broadcast an event to an organisation's isolated Redis channel.
   * Runs non-blocking to prevent Redis glitches from failing business mutations.
   */
  async broadcastToOrganisation(
    organisationId: string,
    event: Omit<RealtimeEventPayload, 'id' | 'occurredAt' | 'organisationId'>,
  ): Promise<void> {
    const channel = this.pubSub.getChannelName(organisationId);
    const fullEvent: RealtimeEventPayload = {
      id: `evt_${randomUUID()}`,
      occurredAt: new Date().toISOString(),
      organisationId,
      ...event,
    };

    this.logger.debug(
      `Broadcasting ${fullEvent.type} to organisation ${organisationId} (WO: ${fullEvent.workOrderId})`,
    );

    await this.pubSub.publish(channel, fullEvent);
  }

  /**
   * Creates an SSE-compliant stream for the given tenant organisation.
   * Scopes events by role: OWNERS and DISPATCHERS see all events,
   * while TECHNICIANS only receive events for work orders assigned to them.
   * Merges real-time domain events with a 15-second heartbeat ping.
   */
  createEventStream(
    organisationId: string,
    userRole: string,
    userId: string,
  ): Observable<RealtimeServerEvent> {
    const channel = this.pubSub.getChannelName(organisationId);

    // 1. Domain events stream from Redis Pub/Sub with role-based filtering
    const domainEvents$ = this.pubSub.subscribe(channel).pipe(
      map((rawMessage: string): RealtimeEventPayload | null => {
        try {
          return JSON.parse(rawMessage) as RealtimeEventPayload;
        } catch {
          return null;
        }
      }),
      filter((payload: RealtimeEventPayload | null): payload is RealtimeEventPayload => {
        if (!payload) {
          return false;
        }

        // Owners and Dispatchers have full organizational visibility
        if (userRole === 'OWNER' || userRole === 'DISPATCHER') {
          return true;
        }

        // Technicians can ONLY receive events for work orders explicitly assigned to them
        if (userRole === 'TECHNICIAN') {
          return payload.assignedTechnicianId === userId;
        }

        return false;
      }),
      map((payload: RealtimeEventPayload): RealtimeServerEvent => ({
        id: payload.id,
        type: payload.type,
        data: JSON.stringify({
          id: payload.id,
          type: payload.type,
          workOrderId: payload.workOrderId,
          reference: payload.reference,
          assignedTechnicianId: payload.assignedTechnicianId,
          occurredAt: payload.occurredAt,
        }),
        retry: 5000,
      })),
    );

    // 2. Keep-alive heartbeat stream every 15 seconds to prevent proxy / NAT timeouts
    const heartbeats$ = timer(0, 15000).pipe(
      map((): RealtimeServerEvent => ({
        id: `ping_${Date.now()}`,
        type: 'ping',
        data: JSON.stringify({ timestamp: new Date().toISOString() }),
      })),
    );

    return merge<[RealtimeServerEvent, RealtimeServerEvent]>(
      domainEvents$,
      heartbeats$,
    );
  }
}
