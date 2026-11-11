import { workOrderRepository, PaginatedWorkOrders } from '../repositories/work-order.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { WorkOrderWithDetails, DashboardMetrics } from '../domain/models/work-order.model.js';
import { TenantContext } from '../domain/models/tenant-context.js';
import {
  ListWorkOrdersQueryDTO,
  CreateWorkOrderDTO,
  UpdateWorkOrderDTO,
  AssignTechnicianDTO,
} from '../api/dtos/work-order.dto.js';
import { NotFoundError, ForbiddenError, SchedulingConflictError } from '../domain/errors/index.js';
import {
  getCachedDashboardMetrics,
  setCachedDashboardMetrics,
  invalidateDashboardCache,
} from '../infrastructure/redis.js';
import { notificationQueue } from '../queues/notification.queue.js';
import { publishRealtimeEvent } from '../realtime/realtime.publisher.js';
import { auditService, AuditLogResponse } from './audit.service.js';

// In-process lock for scheduling concurrency per technician
const technicianLocks = new Map<string, Promise<void>>();

async function acquireTechnicianLock<T>(technicianId: string, fn: () => Promise<T>): Promise<T> {
  while (technicianLocks.has(technicianId)) {
    await technicianLocks.get(technicianId);
  }

  let release: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    release = resolve;
  });
  technicianLocks.set(technicianId, lockPromise);

  try {
    return await fn();
  } finally {
    technicianLocks.delete(technicianId);
    release!();
  }
}

export class WorkOrderService {
  async listWorkOrders(
    ctx: TenantContext,
    filters: ListWorkOrdersQueryDTO
  ): Promise<PaginatedWorkOrders> {
    return workOrderRepository.findMany(
      ctx.organisationId,
      filters,
      ctx.role,
      ctx.userId
    );
  }

  async getWorkOrderById(id: string, ctx: TenantContext): Promise<WorkOrderWithDetails> {
    const workOrder = await workOrderRepository.findById(
      id,
      ctx.organisationId,
      ctx.role,
      ctx.userId
    );

    if (!workOrder) {
      throw new NotFoundError(`Work order with ID '${id}' not found.`);
    }

    return workOrder;
  }

  async createWorkOrder(
    dto: CreateWorkOrderDTO,
    ctx: TenantContext
  ): Promise<WorkOrderWithDetails> {
    if (ctx.role !== 'owner' && ctx.role !== 'dispatcher') {
      throw new ForbiddenError('Only owners and dispatchers can create work orders.');
    }

    // Auto-generate reference number: WO-{ORG_PREFIX}-{SEQ}
    const count = await workOrderRepository.getCount(ctx.organisationId);
    let orgPrefix = 'ORG';
    if (ctx.organisationId.includes('apex')) orgPrefix = 'APEX';
    else if (ctx.organisationId.includes('summit')) orgPrefix = 'SUMMIT';
    else if (ctx.organisationId) {
      orgPrefix = ctx.organisationId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
    }

    const nextSeq = 1001 + count;
    const referenceNumber = `WO-${orgPrefix}-${nextSeq}`;

    const assignedTechId = dto.assignedTechnicianId || dto.technicianId || null;

    const created = await workOrderRepository.create({
      organisationId: ctx.organisationId,
      referenceNumber,
      title: dto.title,
      description: dto.description || null,
      priority: dto.priority,
      status: 'open',
      siteName: dto.siteName,
      assignedTechnicianId: assignedTechId,
      scheduledStart: dto.scheduledStart || null,
      scheduledEnd: dto.scheduledEnd || null,
      createdBy: ctx.userId,
    });

    // Record audit log entry
    await auditService.record({
      organisationId: ctx.organisationId,
      actorId: ctx.userId,
      action: 'WORK_ORDER_CREATED',
      targetType: 'work_order',
      targetId: created.id,
      beforeState: null,
      afterState: {
        title: created.title,
        priority: created.priority,
        siteName: created.siteName,
        createdBy: created.createdBy,
        status: created.status,
      },
      metadata: {
        referenceNumber: created.referenceNumber,
        assignedTechnicianId: assignedTechId,
      },
    });

    // Invalidate Redis dashboard cache
    await invalidateDashboardCache(ctx.organisationId);

    // Publish real-time event
    await publishRealtimeEvent(ctx.organisationId, 'work_order_created', {
      type: 'WORK_ORDER_CREATED',
      workOrderId: created.id,
      referenceNumber: created.referenceNumber,
      status: created.status,
      timestamp: new Date().toISOString(),
    });

    return created;
  }

  async updateWorkOrder(
    id: string,
    dto: UpdateWorkOrderDTO,
    ctx: TenantContext
  ): Promise<WorkOrderWithDetails> {
    if (ctx.role !== 'owner' && ctx.role !== 'dispatcher') {
      throw new ForbiddenError('Only owners and dispatchers can update work orders.');
    }

    // Verify existing work order belongs to tenant (returns 404 on cross-tenant tampering)
    const existing = await workOrderRepository.findById(
      id,
      ctx.organisationId,
      ctx.role,
      ctx.userId
    );

    if (!existing) {
      throw new NotFoundError(`Work order with ID '${id}' not found.`);
    }

    const assignedTechId = dto.assignedTechnicianId !== undefined ? dto.assignedTechnicianId : dto.technicianId;

    const updated = await workOrderRepository.update(id, ctx.organisationId, {
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      status: dto.status,
      siteName: dto.siteName,
      assignedTechnicianId: assignedTechId,
      scheduledStart: dto.scheduledStart,
      scheduledEnd: dto.scheduledEnd,
    });

    if (!updated) {
      throw new NotFoundError(`Work order with ID '${id}' not found.`);
    }

    // Record audit log entry
    const isStatusUpdate = Boolean(dto.status && dto.status !== existing.status);
    await auditService.record({
      organisationId: ctx.organisationId,
      actorId: ctx.userId,
      action: isStatusUpdate ? 'WORK_ORDER_STATUS_UPDATED' : 'work_order:updated',
      targetType: 'work_order',
      targetId: id,
      beforeState: isStatusUpdate ? { status: existing.status } : existing,
      afterState: isStatusUpdate ? { status: updated.status } : updated,
      metadata: {
        fields: Object.keys(dto),
      },
    });

    // Invalidate Redis dashboard cache
    await invalidateDashboardCache(ctx.organisationId);

    // Publish real-time event
    await publishRealtimeEvent(ctx.organisationId, 'work_order_updated', {
      type: 'WORK_ORDER_UPDATED',
      workOrderId: updated.id,
      referenceNumber: updated.referenceNumber,
      status: updated.status,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async getDashboardMetrics(ctx: TenantContext): Promise<DashboardMetrics> {
    const scope = ctx.role === 'technician' ? `tech:${ctx.userId}` : 'all';

    // 1. Try Redis cache
    const cached = await getCachedDashboardMetrics(ctx.organisationId, scope);
    if (cached) {
      return cached;
    }

    // 2. Query repository
    const metrics = await workOrderRepository.getMetrics(
      ctx.organisationId,
      ctx.role,
      ctx.userId
    );

    // 3. Cache for 30s per specification
    await setCachedDashboardMetrics(ctx.organisationId, metrics, scope, 30);

    return metrics;
  }

  async assignTechnician(
    id: string,
    dto: AssignTechnicianDTO,
    ctx: TenantContext
  ): Promise<WorkOrderWithDetails> {
    if (ctx.role !== 'owner' && ctx.role !== 'dispatcher') {
      throw new ForbiddenError('Only owners and dispatchers can assign technicians to work orders.');
    }

    // Anti-enumeration & tenant validation
    const existing = await workOrderRepository.findById(
      id,
      ctx.organisationId,
      ctx.role,
      ctx.userId
    );

    if (!existing) {
      throw new NotFoundError(`Work order with ID '${id}' not found.`);
    }

    // Verify technician exists and belongs to the same organisation
    const tech = await userRepository.findById(dto.technicianId, ctx.organisationId);
    if (!tech || tech.role !== 'technician') {
      throw new NotFoundError('Technician not found in this organisation.');
    }

    const startDate = new Date(dto.scheduledStart);
    const endDate = new Date(dto.scheduledEnd);

    // Concurrency advisory lock per technician
    return acquireTechnicianLock(dto.technicianId, async () => {
      // 1. Query existing active work orders overlapping [scheduled_start, scheduled_end)
      const conflict = await workOrderRepository.findConflictingSchedule(
        dto.technicianId,
        startDate,
        endDate,
        id
      );

      if (conflict) {
        const formatTime = (d: Date | string) => {
          const date = new Date(d);
          return date.toISOString().slice(11, 16);
        };
        throw new SchedulingConflictError(
          `Technician ${tech.name} is already scheduled for ${conflict.referenceNumber} from ${formatTime(conflict.scheduledStart)} to ${formatTime(conflict.scheduledEnd)}.`,
          {
            id: conflict.id,
            referenceNumber: conflict.referenceNumber,
            scheduledStart: conflict.scheduledStart,
            scheduledEnd: conflict.scheduledEnd,
          }
        );
      }

      // 2. Perform schedule assignment
      const updated = await workOrderRepository.assignTechnician(
        id,
        ctx.organisationId,
        dto.technicianId,
        startDate,
        endDate
      );

      if (!updated) {
        throw new NotFoundError(`Work order with ID '${id}' not found.`);
      }

      // 3. Record audit log
      await auditService.record({
        organisationId: ctx.organisationId,
        actorId: ctx.userId,
        action: 'WORK_ORDER_ASSIGNED',
        targetType: 'work_order',
        targetId: id,
        beforeState: {
          assignedTechnicianId: existing.assignedTechnicianId,
          assignedTechnicianName: existing.assignedTechnician?.name || null,
          scheduledStart: existing.scheduledStart,
          scheduledEnd: existing.scheduledEnd,
        },
        afterState: {
          assignedTechnicianId: updated.assignedTechnicianId,
          assignedTechnicianName: tech.name,
          scheduledStart: updated.scheduledStart,
          scheduledEnd: updated.scheduledEnd,
        },
        metadata: {
          technicianId: dto.technicianId,
          technicianName: tech.name,
          scheduledStart: dto.scheduledStart,
          scheduledEnd: dto.scheduledEnd,
        },
      });

      // 4. Enqueue notification job via BullMQ / Redis queue
      await notificationQueue.add(
        'send-technician-assignment',
        {
          workOrderId: id,
          technicianId: dto.technicianId,
          organisationId: ctx.organisationId,
          correlationId: ctx.correlationId,
          simulationMode: (process.env.NOTIFICATION_SIMULATION_MODE as any) || 'always_success',
        },
        {
          jobId: `notify:${ctx.organisationId}:${id}:${dto.technicianId}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
        }
      );

      // 5. Invalidate dashboard metrics cache
      await invalidateDashboardCache(ctx.organisationId);

      // 6. Publish real-time event
      await publishRealtimeEvent(ctx.organisationId, 'work_order_updated', {
        type: 'WORK_ORDER_UPDATED',
        workOrderId: updated.id,
        referenceNumber: updated.referenceNumber,
        status: updated.status,
        technicianId: updated.assignedTechnicianId,
        timestamp: new Date().toISOString(),
      });

      return updated;
    });
  }

  async getActivity(id: string, ctx: TenantContext): Promise<AuditLogResponse[]> {
    const workOrder = await workOrderRepository.findById(id, ctx.organisationId);
    if (!workOrder) {
      throw new NotFoundError(`Work order with ID '${id}' not found.`);
    }

    if (ctx.role === 'technician' && workOrder.assignedTechnicianId !== ctx.userId) {
      throw new ForbiddenError(
        'Technicians can only view activity for work orders assigned to them.'
      );
    }

    return auditService.getActivity(ctx, 'work_order', id);
  }
}

export const workOrderService = new WorkOrderService();

