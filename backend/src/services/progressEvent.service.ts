import { prisma } from '../utils/db';
import { Prisma } from '@prisma/client';
import { NotFoundError, ConflictError } from '../utils/errors';
import { sseManager } from '../utils/sseManager';

export class ProgressEventService {
  async submitEvent(orgId: string, eventData: any, submitterId: string, submitterRole: string) {
    const { eventId, workOrderId, type, occurredAt, payload } = eventData;

    // Verify work order access
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
    });

    if (!workOrder || workOrder.orgId !== orgId) {
      throw new NotFoundError('Work order not found');
    }

    if (submitterRole === 'TECHNICIAN' && workOrder.assignedTechnicianId !== submitterId) {
      throw new NotFoundError('Work order not found'); // Pretend it doesn't exist for security
    }

    // Since we're dealing with concurrent submissions, we wrap this in a transaction.
    // The database UNIQUE constraint on `eventId` is our ultimate idempotency guarantee.
    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Check for existing event (Idempotency)
        const existingEvent = await tx.progressEvent.findUnique({
          where: { eventId },
        });

        if (existingEvent) {
          // If the event exists, we simply return it to the client as if it succeeded just now
          // This fulfills "Process each eventId only once" & "Handle simultaneous duplicate submissions safely"
          return { event: existingEvent, isDuplicate: true };
        }

        // 2. Create the immutable progress event
        const event = await tx.progressEvent.create({
          data: {
            eventId,
            workOrderId,
            orgId,
            type,
            occurredAt: new Date(occurredAt),
            payload,
            submittedBy: submitterId,
          },
        });

        // 3. Apply changes to the work order atomically if the event type requires it
        if (type === 'STATUS_CHANGED' && payload.status) {
          const updatedWorkOrder = await tx.workOrder.update({
            where: { id: workOrderId },
            data: { status: payload.status },
          });

          // 4. Record audit log
          await tx.auditLog.create({
            data: {
              orgId,
              actorId: submitterId,
              action: 'WORK_ORDER_STATUS_CHANGED_VIA_EVENT',
              targetType: 'WORK_ORDER',
              targetId: workOrderId,
              before: workOrder as any,
              after: updatedWorkOrder as any,
              metadata: { eventId, payload },
            },
          });
          
          // Broadcast work order update if status changed
          sseManager.broadcast(orgId, 'work_order_updated', updatedWorkOrder);
        }

        return { event, isDuplicate: false };
      });
    } catch (error: any) {
      // Handle the case where the unique constraint on eventId is violated simultaneously
      // Prisma error code P2002 means Unique constraint failed
      if (error.code === 'P2002' && error.meta?.target?.includes('eventId')) {
        const existingEvent = await prisma.progressEvent.findUnique({
          where: { eventId },
        });
        if (existingEvent) {
          return { event: existingEvent, isDuplicate: true };
        }
      }
      throw error;
    }
  }
}

export const progressEventService = new ProgressEventService();
