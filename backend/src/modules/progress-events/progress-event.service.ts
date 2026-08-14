import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { CreateProgressEventInput } from "./progress-event.types";

export class WorkOrderNotFoundError extends Error {
  constructor() {
    super("Work order not found");
    this.name = "WorkOrderNotFoundError";
  }
}

export const createProgressEvent = async (
  organisationId: string,
  workOrderId: string,
  actorId: string,
  eventId: string,
  input: CreateProgressEventInput,
) => {
  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      organisationId,
    },
  });

  if (!workOrder) {
    throw new WorkOrderNotFoundError();
  }

  return prisma.progressEvent.create({
    data: {
      eventId,
      organisationId,
      workOrderId,
      actorId,
      type: input.type,
      occurredAt: input.occurredAt ?? new Date(),
      payload: input.payload as Prisma.InputJsonValue,
    },
  });
};