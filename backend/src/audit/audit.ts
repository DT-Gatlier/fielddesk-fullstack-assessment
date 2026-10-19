import type { AuthContext } from '../auth/sessions.js';
import type { DbClient } from '../db/pool.js';

export type AuditActor = { type: 'user'; id: string } | { type: 'system' };

export interface AuditEntry {
  orgId: string;
  actor: AuditActor;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

export const userActor = (auth: AuthContext): AuditActor => ({ type: 'user', id: auth.userId });

/**
 * Appends an audit entry using the caller's client, so it commits or rolls back together with the
 * change it describes. The table is append-only (no UPDATE/DELETE grant, plus a trigger).
 */
export async function recordAudit(client: DbClient, entry: AuditEntry): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (org_id, actor_type, actor_id, action, target_type, target_id, before, after, metadata, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.orgId,
      entry.actor.type,
      entry.actor.type === 'user' ? entry.actor.id : null,
      entry.action,
      entry.targetType,
      entry.targetId ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      JSON.stringify(entry.metadata ?? {}),
      entry.requestId ?? null,
    ],
  );
}
