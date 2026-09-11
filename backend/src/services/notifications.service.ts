import type pg from "pg";
import {
  PermanentNotificationError,
  TransientNotificationError,
  parseNotificationMockMode,
  sendMockNotification,
} from "../lib/notification-provider.js";
import { insertAuditLog } from "../repositories/audit.repository.js";
import {
  ensurePendingDelivery,
  updateDeliveryOutcome,
} from "../repositories/notifications.repository.js";
import type { NotificationJobPayload } from "../types/notification.js";

export type NotificationProcessResult =
  | "sent"
  | "already_sent"
  | "failed_permanent";

export async function processNotificationJob(
  pool: pg.Pool,
  payload: NotificationJobPayload,
  attemptNumber: number,
  mockModeRaw: string | undefined,
): Promise<NotificationProcessResult> {
  const mockMode = parseNotificationMockMode(mockModeRaw);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const delivery = await ensurePendingDelivery(client, {
      organisationId: payload.organisationId,
      workOrderId: payload.workOrderId,
      technicianId: payload.technicianId,
      assignmentVersion: payload.assignmentVersion,
    });

    if (delivery.status === "sent") {
      await client.query("COMMIT");
      return "already_sent";
    }

    if (delivery.status === "failed_permanent") {
      await client.query("COMMIT");
      return "failed_permanent";
    }

    const nextAttemptCount = delivery.attemptCount + 1;

    try {
      await sendMockNotification(mockMode, attemptNumber);
    } catch (error) {
      if (error instanceof PermanentNotificationError) {
        await updateDeliveryOutcome(client, delivery.id, {
          status: "failed_permanent",
          attemptCount: nextAttemptCount,
          lastError: error.message,
        });
        await insertAuditLog(client, {
          organisationId: payload.organisationId,
          actorUserId: null,
          action: "notification.failed_permanent",
          entityType: "work_order",
          entityId: payload.workOrderId,
          metadata: {
            assignmentVersion: payload.assignmentVersion,
            technicianId: payload.technicianId,
            correlationId: payload.correlationId,
            error: error.message,
          },
        });
        await client.query("COMMIT");
        throw error;
      }

      if (error instanceof TransientNotificationError) {
        await updateDeliveryOutcome(client, delivery.id, {
          status: "failed_transient",
          attemptCount: nextAttemptCount,
          lastError: error.message,
        });
        await client.query("COMMIT");
        throw error;
      }

      await client.query("ROLLBACK");
      throw error;
    }

    const sentAt = new Date().toISOString();
    await updateDeliveryOutcome(client, delivery.id, {
      status: "sent",
      attemptCount: nextAttemptCount,
      lastError: null,
      sentAt,
    });

    await insertAuditLog(client, {
      organisationId: payload.organisationId,
      actorUserId: null,
      action: "notification.sent",
      entityType: "work_order",
      entityId: payload.workOrderId,
      metadata: {
        assignmentVersion: payload.assignmentVersion,
        technicianId: payload.technicianId,
        correlationId: payload.correlationId,
        sentAt,
      },
    });

    await client.query("COMMIT");
    return "sent";
  } catch (error) {
    if (
      !(error instanceof TransientNotificationError) &&
      !(error instanceof PermanentNotificationError)
    ) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    client.release();
  }
}
