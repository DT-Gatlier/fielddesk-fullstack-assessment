import { PoolClient } from 'pg';
import { query } from '../infrastructure/db.js';
import { TenantContext } from '../domain/models/tenant-context.js';
import { logger } from '../infrastructure/logger.js';

export interface AuditEntryInput {
  organisationId: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  beforeState?: any;
  afterState?: any;
  metadata?: any;
}

export interface AuditLogActor {
  id: string | null;
  name: string;
}

export interface AuditLogResponse {
  id: string;
  action: string;
  actor: AuditLogActor | null;
  targetId: string;
  targetType: string;
  beforeState: any;
  afterState: any;
  metadata: any;
  createdAt: string | Date;
}

export const auditService = {
  record: async (
    entry: AuditEntryInput,
    client?: PoolClient | null
  ): Promise<void> => {
    const text = `
      INSERT INTO audit_logs (
        organisation_id, actor_id, action, target_type, target_id,
        before_state, after_state, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    const params = [
      entry.organisationId,
      entry.actorId,
      entry.action,
      entry.targetType,
      entry.targetId,
      entry.beforeState ? JSON.stringify(entry.beforeState) : null,
      entry.afterState ? JSON.stringify(entry.afterState) : null,
      entry.metadata ? JSON.stringify(entry.metadata) : '{}',
    ];

    try {
      if (client) {
        await client.query(text, params);
      } else {
        await query(text, params);
      }
    } catch (err: any) {
      logger.error(
        {
          err: err.message,
          action: entry.action,
          targetId: entry.targetId,
          targetType: entry.targetType,
        },
        'Failed to record audit log entry'
      );
    }
  },

  getActivity: async (
    ctx: TenantContext,
    targetType: string,
    targetId: string
  ): Promise<AuditLogResponse[]> => {
    const text = `
      SELECT a.*, u.name as actor_name
      FROM audit_logs a
      LEFT JOIN users u ON a.actor_id = u.id
      WHERE a.organisation_id = $1 AND a.target_id = $2 AND a.target_type = $3
      ORDER BY a.created_at DESC
    `;

    const res = await query<any>(text, [ctx.organisationId, targetId, targetType]);

    return res.rows.map((row) => ({
      id: row.id,
      action: row.action,
      actor: row.actor_id
        ? {
            id: row.actor_id,
            name: row.actor_name || 'Unknown User',
          }
        : {
            id: null,
            name: 'System Worker',
          },
      targetId: row.target_id,
      targetType: row.target_type,
      beforeState:
        typeof row.before_state === 'string'
          ? JSON.parse(row.before_state)
          : row.before_state ?? null,
      afterState:
        typeof row.after_state === 'string'
          ? JSON.parse(row.after_state)
          : row.after_state ?? null,
      metadata:
        typeof row.metadata === 'string'
          ? JSON.parse(row.metadata)
          : row.metadata ?? {},
      createdAt: row.created_at,
    }));
  },
};
