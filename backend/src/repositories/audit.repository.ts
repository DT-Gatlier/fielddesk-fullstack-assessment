import type pg from "pg";
import type { AuditLog } from "../types/work-order.js";

type AuditRow = {
  id: string;
  organisation_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

function mapAudit(row: AuditRow): AuditLog {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

export async function insertAuditLog(
  client: pg.Pool | pg.PoolClient,
  input: {
    organisationId: string;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<AuditLog> {
  const result = await client.query<AuditRow>(
    `INSERT INTO audit_logs (
       organisation_id, actor_user_id, action, entity_type, entity_id, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, organisation_id, actor_user_id, action, entity_type, entity_id, metadata, created_at`,
    [
      input.organisationId,
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  return mapAudit(result.rows[0]);
}

export async function listAuditLogsForEntity(
  pool: pg.Pool,
  organisationId: string,
  entityType: string,
  entityId: string,
): Promise<AuditLog[]> {
  const result = await pool.query<AuditRow>(
    `SELECT id, organisation_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
     FROM audit_logs
     WHERE organisation_id = $1 AND entity_type = $2 AND entity_id = $3
     ORDER BY created_at DESC`,
    [organisationId, entityType, entityId],
  );

  return result.rows.map(mapAudit);
}
