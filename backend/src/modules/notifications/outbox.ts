import type { Tx } from '../../../../shared/db';

/**
 * Transactional outbox: the notification row is inserted with the SAME
 * transaction client as the assignment change. Either both commit or neither
 * does, so a committed assignment can never lose its notification and a
 * rolled-back assignment can never send one. The worker's relay moves pending
 * rows into the Redis queue.
 *
 * dedupe_key = "<workOrderId>:assignment:<assignmentVersion>" is UNIQUE, so the
 * same assignment can never produce two notification records.
 */
export async function insertAssignmentNotification(
  tx: Tx,
  wo: {
    id: string; orgId: string; reference: string; title: string; siteName: string;
    scheduledStart: Date; scheduledEnd: Date; assignmentVersion: number;
  },
  technician: { id: string; email: string; name: string },
  requestId: string | undefined,
): Promise<string> {
  const subject = `New assignment ${wo.reference}: ${wo.title}`;
  const body = [
    `Hi ${technician.name},`,
    `You have been assigned ${wo.reference} at ${wo.siteName}.`,
    `Window: ${wo.scheduledStart.toISOString()} – ${wo.scheduledEnd.toISOString()}`,
    requestId ? `(ref ${requestId})` : '',
  ].filter(Boolean).join('\n');
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO notifications (org_id, work_order_id, technician_id, dedupe_key, recipient, subject, body)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [wo.orgId, wo.id, technician.id, `${wo.id}:assignment:${wo.assignmentVersion}`, technician.email, subject, body],
  );
  return rows[0]?.id ?? '';
}
