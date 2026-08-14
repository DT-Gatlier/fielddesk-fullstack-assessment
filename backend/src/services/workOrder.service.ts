import { prisma } from '../utils/db';
import { Prisma, Status, JobStatus } from '@prisma/client';
import { NotFoundError, ConflictError } from '../utils/errors';
import { notificationQueue } from '../utils/queue';
import { sseManager } from '../utils/sseManager';

export class WorkOrderService {
  async getWorkOrders(orgId: string, query: any, userRole: string, userId: string) {
    const { page, limit, status, priority, assignedTechnicianId, search, sortBy, sortDir } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.WorkOrderWhereInput = {
      orgId,
      ...(status && { status }),
      ...(priority && { priority }),
      ...(assignedTechnicianId && { assignedTechnicianId }),
    };

    // Role-based scoping: Technicians can only see their own assigned work orders
    if (userRole === 'TECHNICIAN') {
      where.assignedTechnicianId = userId;
    }

    if (search) {
      where.OR = [
        { referenceNumber: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { siteName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortDir },
        include: {
          assignedTechnician: { select: { id: true, email: true } },
          creator: { select: { id: true, email: true } },
        },
      }),
      prisma.workOrder.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getWorkOrderById(orgId: string, id: string, userRole: string, userId: string) {
    const where: Prisma.WorkOrderWhereUniqueInput = { id };
    
    const workOrder = await prisma.workOrder.findUnique({
      where,
      include: {
        assignedTechnician: { select: { id: true, email: true } },
        creator: { select: { id: true, email: true } },
        attachments: true,
      },
    });

    if (!workOrder || workOrder.orgId !== orgId) {
      throw new NotFoundError('Work order not found');
    }

    if (userRole === 'TECHNICIAN' && workOrder.assignedTechnicianId !== userId) {
      throw new NotFoundError('Work order not found');
    }

    return workOrder;
  }

  async createWorkOrder(orgId: string, data: any, creatorId: string) {
    // Run in a transaction to log audit history
    return await prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.create({
        data: {
          ...data,
          orgId,
          createdBy: creatorId,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorId: creatorId,
          action: 'WORK_ORDER_CREATED',
          targetType: 'WORK_ORDER',
          targetId: workOrder.id,
          after: workOrder as any,
        },
      });

      sseManager.broadcast(orgId, 'work_order_created', workOrder);

      return workOrder;
    });
  }

  async updateWorkOrder(orgId: string, id: string, data: any, actorId: string) {
    const existing = await prisma.workOrder.findUnique({ where: { id } });
    if (!existing || existing.orgId !== orgId) {
      throw new NotFoundError('Work order not found');
    }

    return await prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.update({
        where: { id },
        data,
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          action: 'WORK_ORDER_UPDATED',
          targetType: 'WORK_ORDER',
          targetId: workOrder.id,
          before: existing as any,
          after: workOrder as any,
        },
      });

      sseManager.broadcast(orgId, 'work_order_updated', workOrder);

      return workOrder;
    });
  }

  async getDashboardSummary(orgId: string, userRole: string, userId: string) {
    const where: Prisma.WorkOrderWhereInput = { orgId };
    
    if (userRole === 'TECHNICIAN') {
      where.assignedTechnicianId = userId;
    }

    const counts = await prisma.workOrder.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const summary = {
      open: 0,
      assigned: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
      total: 0,
    };

    counts.forEach((c) => {
      if (c.status === 'OPEN') summary.open = c._count;
      else if (c.status === 'ASSIGNED') summary.assigned = c._count;
      else if (c.status === 'IN_PROGRESS') summary.inProgress = c._count;
      else if (c.status === 'COMPLETED') summary.completed = c._count;
      else if (c.status === 'CANCELLED') summary.cancelled = c._count;
      summary.total += c._count;
    });

    return summary;
  }

  async assignTechnician(orgId: string, id: string, assignedTechnicianId: string, scheduledStart: Date, scheduledEnd: Date, actorId: string) {
    const existing = await prisma.workOrder.findUnique({ where: { id } });
    if (!existing || existing.orgId !== orgId) {
      throw new NotFoundError('Work order not found');
    }

    try {
      // Use SERIALIZABLE isolation to prevent concurrent assignment anomalies 
      // although the Postgres exclusion constraint will also strictly prevent overlaps
      return await prisma.$transaction(async (tx) => {
        const workOrder = await tx.workOrder.update({
          where: { id },
          data: {
            assignedTechnicianId,
            scheduledStart,
            scheduledEnd,
            status: 'ASSIGNED',
          },
        });

        await tx.auditLog.create({
          data: {
            orgId,
            actorId,
            action: 'WORK_ORDER_ASSIGNED',
            targetType: 'WORK_ORDER',
            targetId: workOrder.id,
            before: existing as any,
            after: workOrder as any,
          },
        });

        // Add a tracking record in DB for the job
        const jobRecord = await tx.notificationJob.create({
          data: {
            workOrderId: workOrder.id,
            technicianId: assignedTechnicianId,
            orgId,
            status: JobStatus.PENDING,
          }
        });

        // Enqueue the actual background job
        await notificationQueue.add(
          'notify_technician',
          {
            workOrderId: workOrder.id,
            technicianId: assignedTechnicianId,
            orgId,
            jobRecordId: jobRecord.id,
          },
          {
            // deduplication key based on ID to avoid double-queueing
            jobId: `notify-${workOrder.id}-${assignedTechnicianId}-${jobRecord.id}`
          }
        );

        // Broadcast update
        sseManager.broadcast(orgId, 'work_order_updated', workOrder);

        return workOrder;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: any) {
      // Catch PostgreSQL exclusion constraint violation error code (23P01)
      if (error.code === 'P2010' && error.meta?.code === '23P01') {
        throw new ConflictError('Scheduling conflict: The technician is already assigned to another work order during this time.');
      }
      
      // Prisma error for database constraints (sometimes mapped differently depending on driver)
      if (error.message?.includes('work_orders_scheduling_overlap_excl')) {
        throw new ConflictError('Scheduling conflict: The technician is already assigned to another work order during this time.');
      }
      
      throw error;
    }
  }
}

export const workOrderService = new WorkOrderService();
