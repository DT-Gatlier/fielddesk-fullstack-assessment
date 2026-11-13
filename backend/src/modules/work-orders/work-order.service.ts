import { prisma } from "../../config/prisma";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { realtimeService } from "../realtime/realtime.service";
import { enqueueNotification } from "../../queues/notification.queue";
import {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrderQueryInput,
} from "./work-order.validation";

export class WorkOrderService {
  private async checkTechnicianOverlap(
    technicianId: string,
    organisationId: string,
    start: Date,
    end: Date,
    excludeWorkOrderId?: string,
    db: Prisma.TransactionClient = prisma as unknown as Prisma.TransactionClient
  ) {
    const technician = await db.user.findFirst({ where: { id: technicianId, organisationId, role: "TECHNICIAN" }, select: { id: true } });
    if (!technician) {
      const err: any = new Error("Technician not found in organisation");
      err.status = 400;
      throw err;
    }
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organisationId + ":" + technicianId}, 0))`;
    const overlapping = await db.workOrder.findFirst({
      where: {
        organisationId,
        assignedTechnicianId: technicianId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        scheduledStart: { not: null },
        scheduledEnd: { not: null },
        id: excludeWorkOrderId ? { not: excludeWorkOrderId } : undefined,
        AND: [
          { scheduledStart: { lt: end } },
          { scheduledEnd: { gt: start } },
        ],
      },
    });

    if (overlapping) {
      const conflictError: any = new Error(
        `Technician is already booked on ${overlapping.referenceNumber} during this time window`
      );
      conflictError.status = 409;
      throw conflictError;
    }
  }

  async listWorkOrders(
    organisationId: string,
    role: string,
    userId: string,
    query: WorkOrderQueryInput
  ) {
    const { status, priority, technicianId, search, page, limit, sortBy, sortOrder } = query;

    const where: any = {
      organisationId,
    };

    if (role === "TECHNICIAN") {
      where.assignedTechnicianId = userId;
    } else if (technicianId) {
      where.assignedTechnicianId = technicianId;
    }

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (priority && priority !== "ALL") {
      where.priority = priority;
    }

    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { referenceNumber: { contains: search, mode: "insensitive" } },
        { siteName: { contains: search, mode: "insensitive" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [workOrders, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          assignedTechnician: {
            select: { id: true, name: true, email: true },
          },
          creator: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.workOrder.count({ where }),
    ]);

    return {
      workOrders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getWorkOrderById(
    id: string,
    organisationId: string,
    role: string,
    userId: string
  ) {
    const order = await prisma.workOrder.findFirst({
      where: { id, organisationId },
      include: {
        assignedTechnician: {
          select: { id: true, name: true, email: true },
        },
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!order) {
      const err: any = new Error("Work order not found");
      err.status = 404;
      throw err;
    }

    if (role === "TECHNICIAN" && order.assignedTechnicianId !== userId) {
      const err: any = new Error("You do not have access to this work order");
      err.status = 403;
      throw err;
    }

    return order;
  }

  async createWorkOrder(
    input: CreateWorkOrderInput,
    organisationId: string,
    creatorId: string
  ) {
    const {
      title,
      description,
      priority,
      siteName,
      assignedTechnicianId,
      scheduledStart,
      scheduledEnd,
    } = input;

    const startDate = scheduledStart ? new Date(scheduledStart) : null;
    const endDate = scheduledEnd ? new Date(scheduledEnd) : null;

    if (startDate && endDate && startDate >= endDate) {
      const err: any = new Error("Scheduled end time must be after start time");
      err.status = 400;
      throw err;
    }

    if (assignedTechnicianId && startDate && endDate) {
      await this.checkTechnicianOverlap(
        assignedTechnicianId,
        organisationId,
        startDate,
        endDate
      );
    }

    const referenceNumber = `WO-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;

    const created = await prisma.$transaction(async (tx) => {
      if (assignedTechnicianId && startDate && endDate) await this.checkTechnicianOverlap(assignedTechnicianId, organisationId, startDate, endDate, undefined, tx);
      const workOrder = await tx.workOrder.create({
      data: {
        referenceNumber,
        title,
        description,
        priority: priority as any,
        status: "PENDING",
        siteName,
        organisationId,
        creatorId,
        assignedTechnicianId: assignedTechnicianId || null,
        scheduledStart: startDate,
        scheduledEnd: endDate,
      },
      include: {
        assignedTechnician: {
          select: { id: true, name: true, email: true },
        },
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
      });
      await tx.auditLog.create({ data: { organisationId, actorId: creatorId, action: "work_order.created", targetType: "WorkOrder", targetId: workOrder.id, after: { referenceNumber, title, assignedTechnicianId: workOrder.assignedTechnicianId, status: workOrder.status } } });
      return workOrder;
    });

    realtimeService.broadcast(organisationId, "work-order:created", created);

    if (assignedTechnicianId) {
      await enqueueNotification({
        workOrderId: created.id,
        technicianId: assignedTechnicianId,
        organisationId,
        title: created.title,
      });
    }

    return created;
  }

  async updateWorkOrder(
    id: string,
    input: UpdateWorkOrderInput,
    organisationId: string,
    role: string,
    userId: string
  ) {
    const existing = await prisma.workOrder.findFirst({
      where: { id, organisationId },
    });

    if (!existing) {
      const err: any = new Error("Work order not found");
      err.status = 404;
      throw err;
    }

    if (role === "TECHNICIAN") {
      if (existing.assignedTechnicianId !== userId) {
        const err: any = new Error("You do not have permission to modify this work order");
        err.status = 403;
        throw err;
      }

      if (input.status) {
        const updated = await prisma.$transaction(async (tx) => {
          const result = await tx.workOrder.update({ where: { id }, data: { status: input.status as any },
          include: {
            assignedTechnician: { select: { id: true, name: true, email: true } },
            creator: { select: { id: true, name: true, email: true } },
          },
          });
          await tx.auditLog.create({ data: { organisationId, actorId: userId, action: "work_order.status_changed", targetType: "WorkOrder", targetId: id, before: { status: existing.status }, after: { status: result.status } } });
          return result;
        });
        realtimeService.broadcast(organisationId, "work-order:updated", updated);
        return updated;
      }

      return existing;
    }

    const techId =
      input.assignedTechnicianId !== undefined
        ? input.assignedTechnicianId
        : existing.assignedTechnicianId;

    const startDate =
      input.scheduledStart !== undefined
        ? input.scheduledStart ? new Date(input.scheduledStart) : null
        : existing.scheduledStart;

    const endDate =
      input.scheduledEnd !== undefined
        ? input.scheduledEnd ? new Date(input.scheduledEnd) : null
        : existing.scheduledEnd;

    if (startDate && endDate && startDate >= endDate) {
      const err: any = new Error("Scheduled end time must be after start time");
      err.status = 400;
      throw err;
    }

    if (techId && startDate && endDate) {
      await this.checkTechnicianOverlap(
        techId,
        organisationId,
        startDate,
        endDate,
        id
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (techId && startDate && endDate) await this.checkTechnicianOverlap(techId, organisationId, startDate, endDate, id, tx);
      const workOrder = await tx.workOrder.update({
      where: { id },
      data: {
        title: input.title !== undefined ? input.title : existing.title,
        description: input.description !== undefined ? input.description : existing.description,
        priority: input.priority !== undefined ? (input.priority as any) : existing.priority,
        status: input.status !== undefined ? (input.status as any) : existing.status,
        siteName: input.siteName !== undefined ? input.siteName : existing.siteName,
        assignedTechnicianId: techId,
        scheduledStart: startDate,
        scheduledEnd: endDate,
      },
      include: {
        assignedTechnician: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
      });
      await tx.auditLog.create({ data: { organisationId, actorId: userId, action: "work_order.updated", targetType: "WorkOrder", targetId: id, before: { status: existing.status, assignedTechnicianId: existing.assignedTechnicianId, title: existing.title }, after: { status: workOrder.status, assignedTechnicianId: workOrder.assignedTechnicianId, title: workOrder.title } } });
      return workOrder;
    });

    realtimeService.broadcast(organisationId, "work-order:updated", updated);

    if (techId && techId !== existing.assignedTechnicianId) {
      await enqueueNotification({
        workOrderId: updated.id,
        technicianId: techId,
        organisationId,
        title: updated.title,
      });
    }

    return updated;
  }

  async getMetrics(organisationId: string, role: string, userId: string) {
    const where: any = { organisationId };
    if (role === "TECHNICIAN") {
      where.assignedTechnicianId = userId;
    }

    const [total, pending, inProgress, completed, highPriority] = await Promise.all([
      prisma.workOrder.count({ where }),
      prisma.workOrder.count({ where: { ...where, status: "PENDING" } }),
      prisma.workOrder.count({ where: { ...where, status: "IN_PROGRESS" } }),
      prisma.workOrder.count({ where: { ...where, status: "COMPLETED" } }),
      prisma.workOrder.count({ where: { ...where, priority: "HIGH" } }),
    ]);

    return {
      total,
      pending,
      inProgress,
      completed,
      highPriority,
    };
  }

  async getTechnicians(organisationId: string) {
    return prisma.user.findMany({
      where: {
        organisationId,
        role: "TECHNICIAN",
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async *exportWorkOrdersCsv(
    organisationId: string,
    role: string,
    userId: string,
    query: { status?: string; priority?: string; technicianId?: string; search?: string }
  ) {
    const where: any = { organisationId };

    if (role === "TECHNICIAN") {
      where.assignedTechnicianId = userId;
    }

    if (query.status && query.status !== "ALL") {
      where.status = query.status;
    }

    if (query.priority && query.priority !== "ALL") {
      where.priority = query.priority;
    }

    if (query.technicianId && role !== "TECHNICIAN") where.assignedTechnicianId = query.technicianId;

    if (query.search && query.search.trim()) {
      where.OR = [
        { title: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        { referenceNumber: { contains: query.search, mode: "insensitive" } },
        { siteName: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const headers = [
      "Reference",
      "Title",
      "Priority",
      "Status",
      "Site Location",
      "Technician",
      "Scheduled Start",
      "Scheduled End",
      "Created At",
    ];

    const escapeCell = (val: any) => {
      if (val === null || val === undefined) return '""';
      let str = String(val).trim();
      if (/^[=+\-@]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    yield `${headers.join(",")}\r\n`;
    const batchSize = 500;
    let cursorId: string | undefined;
    for (;;) {
      const orders = await prisma.workOrder.findMany({
        where,
        take: batchSize,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: {
          id: true, referenceNumber: true, title: true, priority: true, status: true, siteName: true,
          scheduledStart: true, scheduledEnd: true, createdAt: true,
          assignedTechnician: { select: { name: true } },
        },
      });
      if (orders.length === 0) break;
      for (const o of orders) yield [
        escapeCell(o.referenceNumber), escapeCell(o.title), escapeCell(o.priority), escapeCell(o.status),
        escapeCell(o.siteName), escapeCell(o.assignedTechnician?.name || "Unassigned"),
        escapeCell(o.scheduledStart?.toISOString() || ""), escapeCell(o.scheduledEnd?.toISOString() || ""),
        escapeCell(o.createdAt.toISOString()),
      ].join(",") + "\r\n";
      cursorId = orders[orders.length - 1].id;
    }
  }
}

