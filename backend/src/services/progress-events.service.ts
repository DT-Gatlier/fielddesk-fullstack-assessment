import type pg from "pg";
import { AppError } from "../lib/errors.js";
import { insertAuditLog } from "../repositories/audit.repository.js";
import {
  findProgressEventByEventId,
  insertProgressEventIfNew,
  toPublicProgressEvent,
} from "../repositories/progress-events.repository.js";
import {
  findAssignedWorkOrderForTechnicianWithClient,
  updateWorkOrderStatusWithClient,
} from "../repositories/work-orders.repository.js";
import { publishWorkOrderEvent } from "./realtime.service.js";
import { toPublicWorkOrder } from "./work-orders.service.js";
import type { AuthContext } from "../types/auth.js";
import type {
  ProgressEvent,
  ProgressEventType,
  SubmitProgressEventInput,
} from "../types/progress-event.js";
import type { WorkOrderStatus } from "../types/work-order.js";

const TECHNICIAN_ALLOWED_STATUSES: WorkOrderStatus[] = ["in_progress", "completed"];

function validatePayload(
  type: ProgressEventType,
  payload: Record<string, unknown>,
): { status?: WorkOrderStatus; note?: string } {
  if (type === "status_changed") {
    const status = payload.status;
    if (typeof status !== "string" || !TECHNICIAN_ALLOWED_STATUSES.includes(status as WorkOrderStatus)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "status_changed events require payload.status of in_progress or completed",
        400,
      );
    }
    const note = payload.note;
    if (note !== undefined && typeof note !== "string") {
      throw new AppError("VALIDATION_ERROR", "payload.note must be a string", 400);
    }
    return { status: status as WorkOrderStatus, note: typeof note === "string" ? note : undefined };
  }

  if (type === "note_added") {
    const note = payload.note;
    if (typeof note !== "string" || note.length === 0) {
      throw new AppError("VALIDATION_ERROR", "note_added events require payload.note", 400);
    }
    return { note };
  }

  throw new AppError("VALIDATION_ERROR", "Unsupported event type", 400);
}

export async function submitProgressEvent(
  pool: pg.Pool,
  auth: AuthContext,
  input: SubmitProgressEventInput,
): Promise<{ event: ReturnType<typeof toPublicProgressEvent>; workOrder: ReturnType<typeof toPublicWorkOrder> }> {
  if (auth.role !== "technician") {
    throw new AppError("FORBIDDEN", "Only technicians may submit progress events", 403);
  }

  const effects = validatePayload(input.type, input.payload);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const workOrder = await findAssignedWorkOrderForTechnicianWithClient(
      client,
      input.workOrderId,
      auth.organisationId,
      auth.userId,
    );

    if (!workOrder) {
      throw new AppError("NOT_FOUND", "Work order not found", 404);
    }

    const insertedEvent = await insertProgressEventIfNew(client, {
      organisationId: auth.organisationId,
      workOrderId: input.workOrderId,
      submittedByUserId: auth.userId,
      eventId: input.eventId,
      eventType: input.type,
      occurredAt: input.occurredAt,
      payload: input.payload,
    });

    if (!insertedEvent) {
      const existing = await findProgressEventByEventId(client, input.eventId);
      if (!existing) {
        throw new AppError(
          "INTERNAL_ERROR",
          "Progress event could not be accepted; retry",
          500,
        );
      }

      const currentWorkOrder = await findAssignedWorkOrderForTechnicianWithClient(
        client,
        input.workOrderId,
        auth.organisationId,
        auth.userId,
      );
      if (!currentWorkOrder) {
        throw new AppError("NOT_FOUND", "Work order not found", 404);
      }

      await client.query("COMMIT");
      return {
        event: toPublicProgressEvent(existing),
        workOrder: toPublicWorkOrder(currentWorkOrder),
      };
    }

    const acceptedEvent: ProgressEvent = insertedEvent;
    let updatedWorkOrder = workOrder;

    if (input.type === "status_changed" && effects.status) {
      const statusUpdated = await updateWorkOrderStatusWithClient(
        client,
        input.workOrderId,
        auth.organisationId,
        effects.status,
      );
      if (!statusUpdated) {
        throw new AppError("NOT_FOUND", "Work order not found", 404);
      }
      updatedWorkOrder = statusUpdated;
    }

    await insertAuditLog(client, {
      organisationId: auth.organisationId,
      actorUserId: auth.userId,
      action: "progress_event.accepted",
      entityType: "work_order",
      entityId: updatedWorkOrder.id,
      metadata: {
        eventId: input.eventId,
        eventType: input.type,
        occurredAt: input.occurredAt,
        payload: input.payload,
        ...(input.type === "status_changed"
          ? { before: { status: workOrder.status }, after: { status: updatedWorkOrder.status } }
          : {}),
      },
    });

    await client.query("COMMIT");

    const result = {
      event: toPublicProgressEvent(acceptedEvent),
      workOrder: toPublicWorkOrder(updatedWorkOrder),
    };

    if (input.type === "status_changed") {
      publishWorkOrderEvent(
        auth.organisationId,
        "work_order.status_changed",
        result.workOrder as unknown as Record<string, unknown>,
      );
    }

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
