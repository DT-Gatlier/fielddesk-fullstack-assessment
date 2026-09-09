import type pg from "pg";
import type { ProgressEvent, ProgressEventType } from "../types/progress-event.js";

type ProgressEventRow = {
  id: string;
  organisation_id: string;
  work_order_id: string;
  submitted_by_user_id: string;
  event_id: string;
  event_type: ProgressEventType;
  occurred_at: Date;
  payload: Record<string, unknown>;
  created_at: Date;
};

function mapProgressEvent(row: ProgressEventRow): ProgressEvent {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    workOrderId: row.work_order_id,
    submittedByUserId: row.submitted_by_user_id,
    eventId: row.event_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at.toISOString(),
    payload: row.payload ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

export async function insertProgressEventIfNew(
  client: pg.PoolClient,
  input: {
    organisationId: string;
    workOrderId: string;
    submittedByUserId: string;
    eventId: string;
    eventType: ProgressEventType;
    occurredAt: string;
    payload: Record<string, unknown>;
  },
): Promise<ProgressEvent | null> {
  const result = await client.query<ProgressEventRow>(
    `INSERT INTO progress_events (
       organisation_id, work_order_id, submitted_by_user_id,
       event_id, event_type, occurred_at, payload
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING *`,
    [
      input.organisationId,
      input.workOrderId,
      input.submittedByUserId,
      input.eventId,
      input.eventType,
      input.occurredAt,
      JSON.stringify(input.payload),
    ],
  );

  if (!result.rowCount) {
    return null;
  }

  return mapProgressEvent(result.rows[0]);
}

export async function findProgressEventByEventId(
  client: pg.PoolClient,
  eventId: string,
): Promise<ProgressEvent | null> {
  const result = await client.query<ProgressEventRow>(
    `SELECT * FROM progress_events WHERE event_id = $1`,
    [eventId],
  );

  if (!result.rowCount) {
    return null;
  }

  return mapProgressEvent(result.rows[0]);
}

export function toPublicProgressEvent(event: ProgressEvent) {
  return {
    id: event.id,
    eventId: event.eventId,
    workOrderId: event.workOrderId,
    type: event.eventType,
    occurredAt: event.occurredAt,
    payload: event.payload,
    createdAt: event.createdAt,
  };
}
