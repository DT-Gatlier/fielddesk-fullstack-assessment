import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { CreateAuditLogInput } from "./audit-log.types";
import { AuditLogListQuery } from "./audit-log.schema";

export const createAuditLog = async (
  input: CreateAuditLogInput,
) => {
  return prisma.auditLog.create({
    data: {
      organisationId: input.organisationId,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      workOrderId: input.workOrderId,

      beforeData:
        input.beforeData === undefined
          ? undefined
          : (input.beforeData as Prisma.InputJsonValue),

      afterData:
        input.afterData === undefined
          ? undefined
          : (input.afterData as Prisma.InputJsonValue),
    },
  });
};

export class WorkOrderNotFoundForAuditError extends Error {
  constructor() {
    super("Work order not found");
    this.name = "WorkOrderNotFoundForAuditError";
  }
}

export const listWorkOrderAuditLogs = async (
  organisationId: string,
  workOrderId: string,
  query: AuditLogListQuery,
) => {
  // IMPORTANT:
  // Check both workOrderId AND organisationId.
  const workOrder = await prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      organisationId,
    },
    select: {
      id: true,
    },
  });

  if (!workOrder) {
    throw new WorkOrderNotFoundForAuditError();
  }

  const skip = (query.page - 1) * query.limit;

  const where = {
    organisationId,
    workOrderId,
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    }),

    prisma.auditLog.count({
      where,
    }),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};