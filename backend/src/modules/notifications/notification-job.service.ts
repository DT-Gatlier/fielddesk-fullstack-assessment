import { prisma } from "../../lib/prisma";

export class WorkOrderNotFoundError extends Error {
  constructor() {
    super("Work order not found");
    this.name = "WorkOrderNotFoundError";
  }
}

export class TechnicianNotFoundError extends Error {
  constructor() {
    super("Technician not found");
    this.name = "TechnicianNotFoundError";
  }
}

export interface CreateNotificationJobInput {
  organisationId: string;
  workOrderId: string;
  technicianId: string;
  dedupeKey: string;
  availableAt?: Date;
}

export const buildNotificationDedupeKey = (
  organisationId: string,
  workOrderId: string,
  technicianId: string,
  eventType: string,
) => {
  return [
    organisationId,
    workOrderId,
    technicianId,
    eventType,
  ].join(":");
};

export const createNotificationJob = async (
  input: CreateNotificationJobInput,
) => {
  const {
    organisationId,
    workOrderId,
    technicianId,
    dedupeKey,
    availableAt,
  } = input;

  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      organisationId,
    },
  });

  if (!workOrder) {
    throw new WorkOrderNotFoundError();
  }

  const technician = await prisma.user.findFirst({
    where: {
      id: technicianId,
      organisationId,
      role: "TECHNICIAN",
    },
  });

  if (!technician) {
    throw new TechnicianNotFoundError();
  }

  return prisma.notificationJob.upsert({
    where: {
      dedupeKey,
    },

    update: {},

    create: {
      organisationId,
      workOrderId,
      technicianId,
      dedupeKey,
      status: "PENDING",
      attempts: 0,
      availableAt: availableAt ?? new Date(),
    },

    include: {
      workOrder: {
        select: {
          id: true,
          referenceNumber: true,
          title: true,
          status: true,
        },
      },

      technician: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
};