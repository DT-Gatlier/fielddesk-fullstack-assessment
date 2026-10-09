import type { Prisma, WorkOrderStatus } from '@fielddesk/database';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import type {
  SubmitProgressEventInput,
  WorkOrderEventRepositoryPort,
  WorkOrderEventSummary,
} from '../interfaces/work-order-event.interface';

const workOrderEventSelect = {
  id: true,
  eventId: true,
  organisationId: true,
  workOrderId: true,
  userId: true,
  user: {
    select: {
      name: true,
      role: true,
    },
  },
  type: true,
  occurredAt: true,
  payload: true,
  createdAt: true,
} as const;

type PrismaWorkOrderEventResult = Prisma.WorkOrderEventGetPayload<{
  select: typeof workOrderEventSelect;
}>;

function mapWorkOrderEvent(
  record: PrismaWorkOrderEventResult,
): WorkOrderEventSummary {
  return {
    id: record.id,
    eventId: record.eventId,
    organisationId: record.organisationId,
    workOrderId: record.workOrderId,
    userId: record.userId,
    userName: record.user.name,
    userRole: record.user.role,
    type: record.type,
    occurredAt: record.occurredAt,
    payload: (record.payload as Record<string, unknown>) ?? {},
    createdAt: record.createdAt,
  };
}

export interface LockedWorkOrderState {
  id: string;
  reference: string;
  status: WorkOrderStatus;
  assignedTechnicianId: string | null;
  createdAt: Date;
}

@Injectable()
export class WorkOrderEventRepository implements WorkOrderEventRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByEventId(
    organisationId: string,
    eventId: string,
  ): Promise<WorkOrderEventSummary | null> {
    const record = await this.prisma.client.workOrderEvent.findUnique({
      where: {
        organisationId_eventId: {
          organisationId,
          eventId,
        },
      },
      select: workOrderEventSelect,
    });

    if (!record) {
      return null;
    }

    return mapWorkOrderEvent(record);
  }

  async listByWorkOrderId(
    organisationId: string,
    workOrderId: string,
  ): Promise<WorkOrderEventSummary[]> {
    const records = await this.prisma.client.workOrderEvent.findMany({
      where: {
        organisationId,
        workOrderId,
      },
      select: workOrderEventSelect,
      orderBy: {
        createdAt: 'asc',
      },
    });

    return records.map(mapWorkOrderEvent);
  }

  async recordEventWithWorkOrderLock(
    organisationId: string,
    workOrderId: string,
    userId: string,
    input: SubmitProgressEventInput,
    validateAndApplyStatusTransition: (
      current: LockedWorkOrderState,
    ) => WorkOrderStatus | null,
  ): Promise<WorkOrderEventSummary> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        // 1. Lock the work order row FOR UPDATE first:
        // This serializes all concurrent progress events / transitions for this work order.
        const lockedRows = await tx.$queryRaw<
          Array<{
            id: string;
            reference: string;
            status: WorkOrderStatus;
            assignedTechnicianId: string | null;
            createdAt: Date;
          }>
        >`
          SELECT "id", "reference", "status", "assignedTechnicianId", "createdAt"
          FROM "WorkOrder"
          WHERE "id" = ${workOrderId}::uuid AND "organisationId" = ${organisationId}::uuid
          FOR UPDATE
        `;

        if (lockedRows.length === 0) {
          throw new Error('WORK_ORDER_NOT_FOUND');
        }

        const lockedWorkOrder = lockedRows[0];

        // 2. Re-check idempotency under the acquired lock:
        // If another transaction with the exact same eventId committed while we waited for the lock,
        // we will find it here and return it cleanly without reapplying status changes.
        const existing = await tx.workOrderEvent.findUnique({
          where: {
            organisationId_eventId: {
              organisationId,
              eventId: input.eventId,
            },
          },
          select: workOrderEventSelect,
        });

        if (existing) {
          return mapWorkOrderEvent(existing);
        }

        // 3. Validate state transitions under the authoritative locked state
        const nextStatus = validateAndApplyStatusTransition(lockedWorkOrder);

        if (nextStatus) {
          await tx.workOrder.update({
            where: {
              organisationId_id: {
                organisationId,
                id: workOrderId,
              },
            },
            data: {
              status: nextStatus,
            },
          });
        }

        // 4. Create the immutable audit event
        const created = await tx.workOrderEvent.create({
          data: {
            eventId: input.eventId,
            organisationId,
            workOrderId,
            userId,
            type: input.type,
            occurredAt: input.occurredAt,
            payload: input.payload as Prisma.InputJsonValue,
          },
          select: workOrderEventSelect,
        });

        return mapWorkOrderEvent(created);
      });
    } catch (err: unknown) {
      // 5. Fallback for simultaneous duplicate submissions that may hit PostgreSQL unique violation (P2002 / 23505)
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        const existing = await this.findByEventId(
          organisationId,
          input.eventId,
        );
        if (existing) {
          return existing;
        }
      }
      throw err;
    }
  }
}
