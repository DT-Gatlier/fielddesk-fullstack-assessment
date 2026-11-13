import { prisma } from "../../config/prisma";
import { Prisma } from "@prisma/client";
import { realtimeService } from "../realtime/realtime.service";
import { CreateProgressEventInput } from "./progress-event.validation";

export class ProgressEventService {
  async processEvent(
    input: CreateProgressEventInput,
    organisationId: string,
    role: string,
    userId: string
  ) {
    const { eventId, workOrderId, type, occurredAt, payload } = input;

    const existingEvent = await prisma.progressEvent.findUnique({
      where: { eventId },
    });

    if (existingEvent) {
      if (existingEvent.organisationId !== organisationId || existingEvent.userId !== userId || existingEvent.workOrderId !== workOrderId || existingEvent.type !== type || existingEvent.occurredAt.getTime() !== new Date(occurredAt).getTime() || JSON.stringify(existingEvent.payload) !== JSON.stringify(payload)) {
        const err: any = new Error("eventId was already used for a different event");
        err.status = 409;
        throw err;
      }

      return {
        success: true,
        isDuplicate: true,
        message: "Event already processed",
        event: existingEvent,
      };
    }

    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, organisationId },
    });

    if (!workOrder) {
      const err: any = new Error("Work order not found in organisation");
      err.status = 404;
      throw err;
    }

    if (role !== "TECHNICIAN" || workOrder.assignedTechnicianId !== userId) {
      const err: any = new Error("You are not assigned to this work order");
      err.status = 403;
      throw err;
    }

    let result;
    try {
    result = await prisma.$transaction(async (tx) => {
      const event = await tx.progressEvent.create({
        data: {
          eventId,
          workOrderId,
          organisationId,
          userId,
          type,
          occurredAt: new Date(occurredAt),
          payload: payload as Prisma.InputJsonObject,
        },
      });

      await tx.auditLog.create({ data: { organisationId, actorId: userId, action: "progress_event.created", targetType: "WorkOrder", targetId: workOrderId, before: { status: workOrder.status }, after: { eventId, type, status: payload.status ?? workOrder.status } } });

      if (payload.status && typeof payload.status === "string") {
        const validStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
        const targetStatus = payload.status.toUpperCase();

        if (validStatuses.includes(targetStatus)) {
          await tx.workOrder.update({
            where: { id: workOrderId },
            data: { status: targetStatus as any },
          });
        }
      }

      return event;
    });
    } catch (error: any) {
      if (error?.code !== "P2002") throw error;
      const duplicate = await prisma.progressEvent.findUnique({ where: { eventId } });
      if (duplicate?.organisationId === organisationId && duplicate.userId === userId && duplicate.workOrderId === workOrderId && duplicate.type === type && duplicate.occurredAt.getTime() === new Date(occurredAt).getTime() && JSON.stringify(duplicate.payload) === JSON.stringify(payload)) {
        return { success: true, isDuplicate: true, message: "Event already processed", event: duplicate };
      }
      const conflict: any = new Error("eventId was already used for a different event");
      conflict.status = 409;
      throw conflict;
    }

    realtimeService.broadcast(organisationId, "progress-event:created", result);

    return {
      success: true,
      isDuplicate: false,
      message: "Progress event accepted and applied",
      event: result,
    };
  }

  async getEventsForWorkOrder(
    workOrderId: string,
    organisationId: string,
    role?: string,
    userId?: string
  ) {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, organisationId },
    });

    if (!workOrder) {
      const err: any = new Error("Work order not found");
      err.status = 404;
      throw err;
    }
    if (role === "TECHNICIAN" && workOrder.assignedTechnicianId !== userId) {
      const err: any = new Error("You are not assigned to this work order");
      err.status = 403;
      throw err;
    }

    return prisma.progressEvent.findMany({
      where: { workOrderId, organisationId },
      orderBy: { occurredAt: "desc" },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    });
  }
}
