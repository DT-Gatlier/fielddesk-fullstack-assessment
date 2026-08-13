import { prisma } from "../../lib/prisma";
import type { UserRole } from "@prisma/client";
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrderListQuery,
} from "./work-order.types";
import { createAuditLog } from "../audit-logs/audit-log.service";

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

export const createWorkOrder = async (
  organisationId: string,
  actorId: string,
  input: CreateWorkOrderInput,
) => {
  if (input.assignedTechnicianId) {
    const technician = await prisma.user.findFirst({
      where: {
        id: input.assignedTechnicianId,
        organisationId,
        role: "TECHNICIAN",
      },
    });

    if (!technician) {
      throw new TechnicianNotFoundError();
    }
  }

  const workOrder = await prisma.workOrder.create({
    data: {
      organisationId,
      createdById: actorId,
      referenceNumber: input.referenceNumber,
      title: input.title,
      description: input.description,
      priority: input.priority,
      status: input.status ?? "PENDING",
      assignedTechnicianId: input.assignedTechnicianId,
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd,
      siteName: input.siteName,
    },
    include: {
      assignedTechnician: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  await createAuditLog({
    organisationId,
    actorId,
    action: "WORK_ORDER_CREATED",
    targetType: "WORK_ORDER",
    targetId: workOrder.id,
    workOrderId: workOrder.id,
    afterData: workOrder,
  });

  return workOrder;
};

export const getWorkOrder = async (
  organisationId: string,
  workOrderId: string,
) => {
  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      organisationId,
    },
    include: {
      assignedTechnician: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      attachments: true,
      progressEvents: {
        orderBy: {
          occurredAt: "desc",
        },
      },
      auditLogs: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!workOrder) {
    throw new WorkOrderNotFoundError();
  }

  return workOrder;
};

export const updateWorkOrder = async (
  organisationId: string,
  workOrderId: string,
  input: UpdateWorkOrderInput,
) => {
  const existing = await prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      organisationId,
    },
  });

  if (!existing) {
    throw new WorkOrderNotFoundError();
  }

  if (input.assignedTechnicianId) {
    const technician = await prisma.user.findFirst({
      where: {
        id: input.assignedTechnicianId,
        organisationId,
        role: "TECHNICIAN",
      },
    });

    if (!technician) {
      throw new TechnicianNotFoundError();
    }
  }

  const updatedWorkOrder = await prisma.workOrder.update({
    where: {
      id: workOrderId,
    },
    data: {
      ...input,
    },
  });

  await createAuditLog({
    organisationId,
    action: "WORK_ORDER_UPDATED",
    targetType: "WORK_ORDER",
    targetId: updatedWorkOrder.id,
    workOrderId: updatedWorkOrder.id,
    afterData: updatedWorkOrder,
    beforeData: existing,
  });

  return updatedWorkOrder;
};

export const listWorkOrders = async (
  organisationId: string,
  query: WorkOrderListQuery,
) => {
  const {
    search,
    status,
    priority,
    assignedTechnicianId,
    page,
    limit,
    sortBy,
    sortOrder,
  } = query;

  const where = {
    organisationId,

    ...(status && {
      status,
    }),

    ...(priority && {
      priority,
    }),

    ...(assignedTechnicianId && {
      assignedTechnicianId,
    }),

    ...(search && {
      OR: [
        {
          referenceNumber: {
            contains: search,
            mode: "insensitive" as const,
          },
        },
        {
          title: {
            contains: search,
            mode: "insensitive" as const,
          },
        },
        {
          siteName: {
            contains: search,
            mode: "insensitive" as const,
          },
        },
      ],
    }),
  };

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.workOrder.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        [sortBy]: sortOrder,
      },
      include: {
        assignedTechnician: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),

    prisma.workOrder.count({
      where,
    }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};