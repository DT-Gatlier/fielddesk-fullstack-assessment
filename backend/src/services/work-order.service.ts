import { workOrderRepository, PaginatedWorkOrders } from '../repositories/work-order.repository.js';
import { WorkOrderWithDetails, DashboardMetrics } from '../domain/models/work-order.model.js';
import { TenantContext } from '../domain/models/tenant-context.js';
import {
  ListWorkOrdersQueryDTO,
  CreateWorkOrderDTO,
  UpdateWorkOrderDTO,
} from '../api/dtos/work-order.dto.js';
import { NotFoundError, ForbiddenError } from '../domain/errors/index.js';
import {
  getCachedDashboardMetrics,
  setCachedDashboardMetrics,
  invalidateDashboardCache,
} from '../infrastructure/redis.js';

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
    await workOrderRepository.createAuditLog({
      organisationId: ctx.organisationId,
      actorId: ctx.userId,
      action: 'work_order:created',
      targetType: 'work_order',
      targetId: created.id,
      afterState: created,
      metadata: {
        referenceNumber: created.referenceNumber,
        assignedTechnicianId: assignedTechId,
      },
    });

    // Invalidate Redis dashboard cache
    await invalidateDashboardCache(ctx.organisationId);

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
    await workOrderRepository.createAuditLog({
      organisationId: ctx.organisationId,
      actorId: ctx.userId,
      action: 'work_order:updated',
      targetType: 'work_order',
      targetId: id,
      beforeState: existing,
      afterState: updated,
    });

    // Invalidate Redis dashboard cache
    await invalidateDashboardCache(ctx.organisationId);

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
}

export const workOrderService = new WorkOrderService();

