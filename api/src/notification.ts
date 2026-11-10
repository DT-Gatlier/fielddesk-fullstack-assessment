import { UnrecoverableError } from 'bullmq';
import { prisma } from './db';

// The mock provider's durable receipt represents its idempotency-key contract.
export async function processNotification(id: string, mode = process.env.MOCK_NOTIFICATION_MODE || 'success') {
  if (typeof id !== 'string' || !id || id.length > 100) throw new UnrecoverableError('Invalid notification ID.');
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Notification" WHERE id = ${id} FOR UPDATE`;
    const item = await tx.notification.findUnique({ where: { id } });
    if (!item || item.status === 'SENT' || item.status === 'FAILED') return 'duplicate';
    const attempt = item.attempts + 1;
    const temporary = mode === 'temporary' || (mode === 'temporary-once' && attempt === 1);
    const permanent = !['success', 'temporary', 'temporary-once'].includes(mode) || !item.recipient.includes('@');
    const failed = permanent || (temporary && attempt >= 4);
    const status = failed ? 'FAILED' : temporary ? 'PENDING' : 'SENT';
    const reason = permanent ? 'Provider rejected the recipient or configuration.' : temporary ? 'Provider temporarily unavailable.' : null;
    if (status === 'SENT') {
      await tx.$executeRaw`INSERT INTO "MockDelivery" ("notificationId") VALUES (${id}) ON CONFLICT DO NOTHING`;
    }
    await tx.$executeRaw`INSERT INTO "NotificationAttempt" ("notificationId", attempt, outcome) VALUES (${id}, ${attempt}, ${status})`;
    await tx.notification.update({ where: { id }, data: { status, attempts: attempt, lastError: reason, sentAt: status === 'SENT' ? new Date() : null } });
    if (status !== 'PENDING') await tx.auditLog.create({ data: {
      organisationId: item.organisationId, jobId: item.jobId, targetType: 'notification', targetId: id,
      action: status === 'SENT' ? 'notification_sent' : 'notification_failed',
      afterData: { attempt, reason, channel: item.channel },
    } });
    console.log(JSON.stringify({ level: 'info', message: 'notification_attempt', notificationId: id, attempt, status, reason }));
    return status;
  });
  // Throw outside the transaction so attempts and terminal outcomes remain durable.
  if (result === 'FAILED') throw new UnrecoverableError('Notification permanently failed.');
  if (result === 'PENDING') throw new Error('Provider temporarily unavailable.');
  return { delivered: result === 'SENT', duplicate: result === 'duplicate' };
}
