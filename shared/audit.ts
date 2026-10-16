import type { Db } from './db';

export type AuditAction =
  | 'work_order.created'
  | 'work_order.updated'
  | 'work_order.assignment_changed'
  | 'work_order.status_changed'
  | 'progress_event.accepted'
  | 'attachment.added'
  | 'user.created'
  | 'user.role_changed'
  | 'user.status_changed'
  | 'organisation.updated'
  | 'notification.delivered'
  | 'notification.failed'
  | 'notification.attempt_failed'
  | 'auth.login'
  | 'auth.logout';

export interface AuditEntry {
  orgId: string;
  actorType: 'user' | 'system';
  actorId: string | null;
  action: AuditAction;
  targetType: 'work_order' | 'user' | 'organisation' | 'attachment' | 'notification';
  targetId: string;
  /** Work order the entry belongs to, so activity history can be listed per work order. */
  workOrderId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}

/**
 * Appends an audit entry. Always call this with the same transaction client as
 * the change it describes, so the entry commits or rolls back together with it.
 * The audit_log table rejects UPDATE and DELETE at the database level.
 */
export async function writeAudit(db: Db, e: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_log
       (org_id, actor_type, actor_id, action, target_type, target_id, work_order_id,
        before, after, metadata, request_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      e.orgId,
      e.actorType,
      e.actorId,
      e.action,
      e.targetType,
      e.targetId,
      e.workOrderId ?? null,
      e.before === undefined ? null : JSON.stringify(e.before),
      e.after === undefined ? null : JSON.stringify(e.after),
      JSON.stringify(e.metadata ?? {}),
      e.requestId ?? null,
    ],
  );
}
