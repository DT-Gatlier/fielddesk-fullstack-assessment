import type pg from "pg";
import { AppError } from "../lib/errors.js";
import { insertAuditLog } from "../repositories/audit.repository.js";
import {
  createWorkOrder,
  findWorkOrderByIdInOrg,
  generateReferenceNumber,
  getDashboardSummary,
  listWorkOrders,
  technicianExistsInOrg,
  updateWorkOrder,
  updateWorkOrderStatus,
} from "../repositories/work-orders.repository.js";
import { assignWorkOrderSafely } from "./scheduling.service.js";
import type { AuthContext, UserRole } from "../types/auth.js";
import type {
  WorkOrder,
  WorkOrderListQuery,
  WorkOrderPriority,
  WorkOrderStatus,
} from "../types/work-order.js";

const MANAGE_ROLES: UserRole[] = ["owner", "dispatcher"];

export function canManageWorkOrders(role: UserRole): boolean {
  return MANAGE_ROLES.includes(role);
}

export function canViewWorkOrder(auth: AuthContext, workOrder: WorkOrder): boolean {
  if (canManageWorkOrders(auth.role)) {
    return workOrder.organisationId === auth.organisationId;
  }
  return workOrder.assignedTechnicianId === auth.userId;
}

export async function createWorkOrderForOrg(
  pool: pg.Pool,
  auth: AuthContext,
  input: {
    title: string;
    description: string;
    priority: WorkOrderPriority;
    siteName: string;
  },
): Promise<WorkOrder> {
  if (!canManageWorkOrders(auth.role)) {
    throw new AppError("FORBIDDEN", "Insufficient permissions", 403);
  }

  const referenceNumber = await generateReferenceNumber(pool, auth.organisationId);
  const workOrder = await createWorkOrder(pool, {
    organisationId: auth.organisationId,
    createdByUserId: auth.userId,
    referenceNumber,
    title: input.title,
    description: input.description,
    priority: input.priority,
    siteName: input.siteName,
  });

  await insertAuditLog(pool, {
    organisationId: auth.organisationId,
    actorUserId: auth.userId,
    action: "work_order.created",
    entityType: "work_order",
    entityId: workOrder.id,
    metadata: { referenceNumber: workOrder.referenceNumber, title: workOrder.title },
  });

  return workOrder;
}

export async function getWorkOrderDetail(
  pool: pg.Pool,
  auth: AuthContext,
  workOrderId: string,
) {
  const workOrder = await findWorkOrderByIdInOrg(
    pool,
    workOrderId,
    auth.organisationId,
  );

  if (!workOrder || !canViewWorkOrder(auth, workOrder)) {
    throw new AppError("NOT_FOUND", "Work order not found", 404);
  }

  return workOrder;
}

export async function updateWorkOrderForOrg(
  pool: pg.Pool,
  auth: AuthContext,
  workOrderId: string,
  updates: {
    title?: string;
    description?: string;
    priority?: WorkOrderPriority;
    siteName?: string;
  },
): Promise<WorkOrder> {
  if (!canManageWorkOrders(auth.role)) {
    throw new AppError("FORBIDDEN", "Insufficient permissions", 403);
  }

  const existing = await findWorkOrderByIdInOrg(
    pool,
    workOrderId,
    auth.organisationId,
  );
  if (!existing) {
    throw new AppError("NOT_FOUND", "Work order not found", 404);
  }

  const updated = await updateWorkOrder(
    pool,
    workOrderId,
    auth.organisationId,
    updates,
  );

  if (!updated) {
    throw new AppError("NOT_FOUND", "Work order not found", 404);
  }

  await insertAuditLog(pool, {
    organisationId: auth.organisationId,
    actorUserId: auth.userId,
    action: "work_order.updated",
    entityType: "work_order",
    entityId: updated.id,
    metadata: { before: existing, after: updated },
  });

  return updated;
}

export async function assignWorkOrderForOrg(
  pool: pg.Pool,
  auth: AuthContext,
  workOrderId: string,
  input: {
    assignedTechnicianId: string;
    scheduledStart: string;
    scheduledEnd: string;
  },
): Promise<WorkOrder> {
  if (!canManageWorkOrders(auth.role)) {
    throw new AppError("FORBIDDEN", "Insufficient permissions", 403);
  }

  const start = new Date(input.scheduledStart);
  const end = new Date(input.scheduledEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new AppError(
      "VALIDATION_ERROR",
      "scheduledStart must be before scheduledEnd",
      400,
    );
  }

  const technicianOk = await technicianExistsInOrg(
    pool,
    input.assignedTechnicianId,
    auth.organisationId,
  );
  if (!technicianOk) {
    throw new AppError("VALIDATION_ERROR", "Invalid technician for this organisation", 400);
  }

  const updated = await assignWorkOrderSafely(
    pool,
    workOrderId,
    auth.organisationId,
    auth.userId,
    input,
  );

  return updated;
}

export async function updateWorkOrderStatusForOrg(
  pool: pg.Pool,
  auth: AuthContext,
  workOrderId: string,
  status: WorkOrderStatus,
): Promise<WorkOrder> {
  const existing = await findWorkOrderByIdInOrg(
    pool,
    workOrderId,
    auth.organisationId,
  );
  if (!existing || !canViewWorkOrder(auth, existing)) {
    throw new AppError("NOT_FOUND", "Work order not found", 404);
  }

  if (auth.role === "technician" && existing.assignedTechnicianId !== auth.userId) {
    throw new AppError("NOT_FOUND", "Work order not found", 404);
  }

  if (auth.role === "technician" && !["in_progress", "completed"].includes(status)) {
    throw new AppError("FORBIDDEN", "Technicians may only set in_progress or completed", 403);
  }

  if (!canManageWorkOrders(auth.role) && auth.role !== "technician") {
    throw new AppError("FORBIDDEN", "Insufficient permissions", 403);
  }

  const updated = await updateWorkOrderStatus(
    pool,
    workOrderId,
    auth.organisationId,
    status,
  );
  if (!updated) {
    throw new AppError("NOT_FOUND", "Work order not found", 404);
  }

  await insertAuditLog(pool, {
    organisationId: auth.organisationId,
    actorUserId: auth.userId,
    action: "work_order.status_changed",
    entityType: "work_order",
    entityId: updated.id,
    metadata: { before: { status: existing.status }, after: { status: updated.status } },
  });

  return updated;
}

export async function listWorkOrdersForOrg(
  pool: pg.Pool,
  auth: AuthContext,
  query: Omit<WorkOrderListQuery, "organisationId" | "assignedTechnicianId"> & {
    assignedTechnicianId?: string;
  },
) {
  const listQuery: WorkOrderListQuery = {
    ...query,
    organisationId: auth.organisationId,
    assignedTechnicianId:
      auth.role === "technician" ? auth.userId : query.assignedTechnicianId,
  };

  return listWorkOrders(pool, listQuery);
}

export async function getDashboardForOrg(pool: pg.Pool, auth: AuthContext) {
  return getDashboardSummary(
    pool,
    auth.organisationId,
    auth.role === "technician" ? auth.userId : undefined,
  );
}

export function toPublicWorkOrder(workOrder: WorkOrder) {
  return workOrder;
}
