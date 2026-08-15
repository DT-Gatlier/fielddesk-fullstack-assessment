import { PrismaClient, Role, Priority, Status, EventType } from '@prisma/client';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // 1. Create Organisations
  const orgA = await prisma.organisation.upsert({
    where: { slug: 'acmefix' },
    update: {},
    create: {
      name: 'AcmeFix Maintenance',
      slug: 'acmefix',
      storageLimitBytes: 500 * 1024 * 1024, // 500MB
    },
  });

  const orgB = await prisma.organisation.upsert({
    where: { slug: 'techserve' },
    update: {},
    create: {
      name: 'TechServe Solutions',
      slug: 'techserve',
      storageLimitBytes: 500 * 1024 * 1024,
    },
  });

  // Initialize storage usage
  await prisma.storageUsage.upsert({
    where: { orgId: orgA.id },
    update: {},
    create: { orgId: orgA.id, usedBytes: 0 },
  });

  await prisma.storageUsage.upsert({
    where: { orgId: orgB.id },
    update: {},
    create: { orgId: orgB.id, usedBytes: 0 },
  });

  console.log('Organizations created');

  // 2. Create Users
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const users = [
    { email: 'owner@acmefix.com', role: Role.OWNER, orgId: orgA.id },
    { email: 'dispatcher@acmefix.com', role: Role.DISPATCHER, orgId: orgA.id },
    { email: 'tech@acmefix.com', role: Role.TECHNICIAN, orgId: orgA.id },
    { email: 'owner@techserve.com', role: Role.OWNER, orgId: orgB.id },
    { email: 'dispatcher@techserve.com', role: Role.DISPATCHER, orgId: orgB.id },
    { email: 'tech@techserve.com', role: Role.TECHNICIAN, orgId: orgB.id },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        email: user.email,
        passwordHash,
        role: user.role,
        orgId: user.orgId,
      },
    });
  }

  console.log('Users created');

  // Fetch users for relations
  const dispatcherA = await prisma.user.findUnique({ where: { email: 'dispatcher@acmefix.com' } });
  const techA = await prisma.user.findUnique({ where: { email: 'tech@acmefix.com' } });
  
  if (!dispatcherA || !techA) throw new Error('Missing users for AcmeFix');

  // 3. Create Sample Work Orders
  const now = new Date();
  const later = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours later

  const workOrder = await prisma.workOrder.upsert({
    where: { orgId_referenceNumber: { orgId: orgA.id, referenceNumber: 'WO-001' } },
    update: {},
    create: {
      orgId: orgA.id,
      referenceNumber: 'WO-001',
      title: 'Fix AC Unit',
      description: 'The AC unit in the main lobby is making a strange noise.',
      priority: Priority.HIGH,
      status: Status.ASSIGNED,
      siteName: 'Main Office',
      createdBy: dispatcherA.id,
      assignedTechnicianId: techA.id,
      scheduledStart: now,
      scheduledEnd: later,
    },
  });

  console.log('Work orders created');

  // 4. Create an Audit Log
  await prisma.auditLog.create({
    data: {
      orgId: orgA.id,
      actorId: dispatcherA.id,
      action: 'WORK_ORDER_CREATED',
      targetType: 'WORK_ORDER',
      targetId: workOrder.id,
      metadata: { priority: 'HIGH', siteName: 'Main Office' },
    },
  });

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
