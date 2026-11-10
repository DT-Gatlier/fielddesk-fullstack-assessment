require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const path = require('node:path');
const fs = require('node:fs/promises');

const databaseUrl = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname)) {
  throw new Error('This cleanup script only supports a local development database.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function counts(client) {
  const result = {};
  for (const model of ['user', 'organisation', 'customer', 'job', 'attachment', 'progressEvent', 'auditLog', 'notification']) {
    result[model] = await client[model].count();
  }
  return result;
}

async function main() {
  console.log('Database:', databaseUrl.hostname, databaseUrl.pathname);
  console.log('Before:', await counts(prisma));
  if (!process.argv.includes('--execute')) {
    console.log('Preview only. Add --execute to delete business data and retain accounts, organisations and sessions.');
    return;
  }

  const attachments = await prisma.$transaction(async tx => {
    // Prevent concurrent API/worker writes while clearing related records.
    await tx.$executeRaw`LOCK TABLE "Job", "Customer", "Attachment", "ProgressEvent", "AuditLog", "Notification", "MockDelivery", "NotificationAttempt", "organisations" IN ACCESS EXCLUSIVE MODE`;
    const files = await tx.attachment.findMany({ select: { storageKey: true } });
    await tx.notification.deleteMany(); // Delivery receipts and attempts cascade.
    await tx.auditLog.deleteMany();
    await tx.progressEvent.deleteMany();
    await tx.attachment.deleteMany();
    await tx.job.deleteMany();
    await tx.customer.deleteMany();
    await tx.organisation.updateMany({ data: { storageUsedBytes: 0n } });
    return files;
  }, { timeout: 30000 });

  const uploadRoot = path.resolve(process.cwd(), 'uploads');
  for (const attachment of attachments) {
    const filePath = path.resolve(uploadRoot, attachment.storageKey);
    const relativePath = path.relative(uploadRoot, filePath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      console.warn('Skipped attachment with an invalid storage path.');
      continue;
    }
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('Could not remove attachment file:', error.code);
    }
  }
  console.log('After:', await counts(prisma));
}

main()
  .catch(error => {
    console.error('Cleanup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
