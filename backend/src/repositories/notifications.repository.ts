import type pg from "pg";
import type { NotificationDelivery, NotificationStatus } from "../types/notification.js";

type DeliveryRow = {
  id: string;
  organisation_id: string;
  work_order_id: string;
  technician_id: string;
  assignment_version: number;
  status: NotificationStatus;
  attempt_count: number;
  last_error: string | null;
  sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapDelivery(row: DeliveryRow): NotificationDelivery {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    workOrderId: row.work_order_id,
    technicianId: row.technician_id,
    assignmentVersion: row.assignment_version,
    status: row.status,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    sentAt: row.sent_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function findDeliveryByWorkOrderVersion(
  client: pg.Pool | pg.PoolClient,
  workOrderId: string,
  assignmentVersion: number,
): Promise<NotificationDelivery | null> {
  const result = await client.query<DeliveryRow>(
    `SELECT * FROM notification_deliveries
     WHERE work_order_id = $1 AND assignment_version = $2`,
    [workOrderId, assignmentVersion],
  );

  if (!result.rowCount) {
    return null;
  }

  return mapDelivery(result.rows[0]);
}

export async function ensurePendingDelivery(
  client: pg.PoolClient,
  input: {
    organisationId: string;
    workOrderId: string;
    technicianId: string;
    assignmentVersion: number;
  },
): Promise<NotificationDelivery> {
  const existing = await findDeliveryByWorkOrderVersion(
    client,
    input.workOrderId,
    input.assignmentVersion,
  );
  if (existing) {
    return existing;
  }

  const result = await client.query<DeliveryRow>(
    `INSERT INTO notification_deliveries (
       organisation_id, work_order_id, technician_id, assignment_version, status
     )
     VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT (work_order_id, assignment_version) DO NOTHING
     RETURNING *`,
    [
      input.organisationId,
      input.workOrderId,
      input.technicianId,
      input.assignmentVersion,
    ],
  );

  if (result.rowCount) {
    return mapDelivery(result.rows[0]);
  }

  const row = await findDeliveryByWorkOrderVersion(
    client,
    input.workOrderId,
    input.assignmentVersion,
  );
  if (!row) {
    throw new Error("Failed to create or load notification delivery");
  }
  return row;
}

export async function updateDeliveryOutcome(
  client: pg.PoolClient,
  deliveryId: string,
  input: {
    status: NotificationStatus;
    attemptCount: number;
    lastError?: string | null;
    sentAt?: string | null;
  },
): Promise<NotificationDelivery> {
  const result = await client.query<DeliveryRow>(
    `UPDATE notification_deliveries
     SET status = $2,
         attempt_count = $3,
         last_error = $4,
         sent_at = $5,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      deliveryId,
      input.status,
      input.attemptCount,
      input.lastError ?? null,
      input.sentAt ?? null,
    ],
  );

  return mapDelivery(result.rows[0]);
}
