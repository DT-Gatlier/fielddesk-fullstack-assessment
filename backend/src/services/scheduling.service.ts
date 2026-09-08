import type pg from "pg";
import type { WorkOrder } from "../types/work-order.js";
import { AppError } from "../lib/errors.js";
import {
  SchedulingOverlapError,
  assignWorkOrderInTransaction,
  findWorkOrderByIdInOrgWithClient,
} from "../repositories/work-orders.repository.js";
import { insertAuditLog } from "../repositories/audit.repository.js";

export function isSchedulingConflictError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23P01"
  );
}

export async function assignWorkOrderSafely(
  pool: pg.Pool,
  workOrderId: string,
  organisationId: string,
  actorUserId: string,
  input: {
    assignedTechnicianId: string;
    scheduledStart: string;
    scheduledEnd: string;
  },
): Promise<WorkOrder> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await findWorkOrderByIdInOrgWithClient(
      client,
      workOrderId,
      organisationId,
    );
    if (!existing) {
      throw new AppError("NOT_FOUND", "Work order not found", 404);
    }

    const updated = await assignWorkOrderInTransaction(
      client,
      workOrderId,
      organisationId,
      input,
    );

    if (!updated) {
      throw new AppError("NOT_FOUND", "Work order not found", 404);
    }

    await insertAuditLog(client, {
      organisationId,
      actorUserId,
      action: "work_order.assigned",
      entityType: "work_order",
      entityId: updated.id,
      metadata: {
        before: {
          assignedTechnicianId: existing.assignedTechnicianId,
          scheduledStart: existing.scheduledStart,
          scheduledEnd: existing.scheduledEnd,
        },
        after: {
          assignedTechnicianId: updated.assignedTechnicianId,
          scheduledStart: updated.scheduledStart,
          scheduledEnd: updated.scheduledEnd,
        },
      },
    });

    await client.query("COMMIT");
    return updated;
  } catch (error) {
    await client.query("ROLLBACK");

    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof SchedulingOverlapError || isSchedulingConflictError(error)) {
      throw new AppError(
        "SCHEDULING_CONFLICT",
        "Technician already has an overlapping assignment during this window",
        409,
      );
    }

    throw error;
  } finally {
    client.release();
  }
}
