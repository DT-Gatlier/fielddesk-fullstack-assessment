import { query, withTransaction } from '../infrastructure/db.js';
import { TenantContext } from '../domain/models/tenant-context.js';
import { ProgressEventDTO } from '../api/dtos/event.dto.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../domain/errors/index.js';
import {
  tryAcquireIdempotencyKey,
  completeIdempotencyKey,
  clearIdempotencyKey,
  invalidateDashboardCache,
  publishRealtimeEvent,
} from '../infrastructure/redis.js';
import { workOrderRepository } from '../repositories/work-order.repository.js';

export interface ProcessEventResult {
  status: 'applied' | 'duplicate_ignored';
  eventId: string;
  workOrderId?: string;
  newStatus?: string;
  processedAt?: string;
  message?: string;
}

export class EventService {
  async processEvent(
    ctx: TenantContext,
    workOrderId: string,
    dto: ProgressEventDTO
  ): Promise<ProcessEventResult> {
    // 1. Verify route parameter matches body
    if (dto.workOrderId && dto.workOrderId !== workOrderId) {
      throw new ValidationError('workOrderId in URL parameter and request body must match.');
    }

    // 2. Fast-Path check via Redis idempotency key
    const redisStatus = await tryAcquireIdempotencyKey(ctx.organisationId, dto.eventId);
    if (redisStatus === 'COMPLETED') {
      return {
        status: 'duplicate_ignored',
        eventId: dto.eventId,
        message: 'Event was previously processed. No changes applied.',
      };
    }

    try {
      return await withTransaction(async () => {
        // 3. Fetch work order FOR UPDATE (Anti-enumeration & lock)
        const woRes = await query<any>(
          `SELECT * FROM work_orders WHERE id = $1 AND organisation_id = $2 FOR UPDATE`,
          [workOrderId, ctx.organisationId]
        );

        if (!woRes.rows.length) {
          throw new NotFoundError(`Work order with ID '${workOrderId}' not found.`);
        }

        const wo = woRes.rows[0];

        // 4. Authorize: Technicians can only submit for work orders assigned to them
        if (ctx.role === 'technician' && wo.assigned_technician_id !== ctx.userId) {
          throw new ForbiddenError(
            'Technicians can only submit progress events for work orders assigned to them.'
          );
        }

        // 5. Durable Deduplication: Insert into processed_events table
        const insertEventRes = await query<any>(
          `
          INSERT INTO processed_events (
            event_id, organisation_id, work_order_id, event_type, occurred_at, payload
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (organisation_id, event_id) DO NOTHING
          RETURNING event_id
        `,
          [
            dto.eventId,
            ctx.organisationId,
            workOrderId,
            dto.type,
            dto.occurredAt,
            JSON.stringify(dto.payload),
          ]
        );

        // If duplicate detected in database (0 rows inserted)
        if (insertEventRes.rowCount === 0 || !insertEventRes.rows.length) {
          await completeIdempotencyKey(ctx.organisationId, dto.eventId);
          return {
            status: 'duplicate_ignored',
            eventId: dto.eventId,
            message: 'Event was previously processed. No changes applied.',
          };
        }

        const newStatus = dto.payload.status || wo.status;

        // 6. Update work order status if specified
        if (dto.payload.status && dto.payload.status !== wo.status) {
          await query(
            `UPDATE work_orders SET status = $1, updated_at = NOW() WHERE id = $2`,
            [newStatus, workOrderId]
          );
        }

        // 7. Insert audit record for the progress event
        await workOrderRepository.createAuditLog({
          organisationId: ctx.organisationId,
          actorId: ctx.userId,
          action: 'STATUS_CHANGED_VIA_EVENT',
          targetType: 'work_order',
          targetId: workOrderId,
          beforeState: {
            status: wo.status,
          },
          afterState: {
            status: newStatus,
          },
          metadata: {
            eventId: dto.eventId,
            type: dto.type,
            occurredAt: dto.occurredAt,
            note: dto.payload.note,
          },
        });

        // 8. Mark Redis idempotency key as COMPLETED (24-hour TTL)
        await completeIdempotencyKey(ctx.organisationId, dto.eventId);

        // 9. Invalidate dashboard metrics cache
        await invalidateDashboardCache(ctx.organisationId);

        // 10. Publish event to Redis channel for live dashboard streaming
        await publishRealtimeEvent(ctx.organisationId, {
          type: 'work_order:progress_updated',
          workOrderId,
          eventId: dto.eventId,
          eventType: dto.type,
          newStatus,
          occurredAt: dto.occurredAt,
          actorId: ctx.userId,
        });

        return {
          status: 'applied',
          eventId: dto.eventId,
          workOrderId,
          newStatus,
          processedAt: new Date().toISOString(),
        };
      });
    } catch (err) {
      // Clear in-flight Redis lock if an unhandled error occurred
      await clearIdempotencyKey(ctx.organisationId, dto.eventId);
      throw err;
    }
  }
}

export const eventService = new EventService();

