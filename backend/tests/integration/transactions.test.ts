import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role, EventType } from '@prisma/client';
import { ProgressEventService } from '../../src/services/progressEvent.service';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();
const progressEventService = new ProgressEventService();

describe('Transaction Rollback Behavior', () => {
  let orgId: string;
  let technicianId: string;
  let woId: string;

  beforeAll(async () => {
    const org = await prisma.organisation.create({
      data: { name: 'Test Org 3', slug: `test3-${uuidv4()}`, storageLimitBytes: 1000 },
    });
    orgId = org.id;

    const tech = await prisma.user.create({
      data: { email: `tech3-${uuidv4()}@test.com`, passwordHash: 'hash', role: Role.TECHNICIAN, orgId },
    });
    technicianId = tech.id;

    const wo = await prisma.workOrder.create({
      data: { orgId, referenceNumber: `WO4-${uuidv4()}`, title: 'W4', description: 'D4', siteName: 'S4', createdBy: technicianId, assignedTechnicianId: technicianId, status: 'OPEN' },
    });
    woId = wo.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rolls back progress event and audit log if work order update fails', async () => {
    const eventId = uuidv4();
    const eventData = {
      eventId,
      workOrderId: woId,
      type: EventType.STATUS_CHANGED,
      occurredAt: new Date(),
      // Inject an invalid status to force Prisma to throw during the transaction
      payload: { status: 'INVALID_STATUS' },
    };

    let error;
    try {
      await progressEventService.submitEvent(orgId, eventData as any, technicianId, 'TECHNICIAN');
    } catch (e: any) {
      error = e;
    }

    // Expecting Prisma validation error due to invalid enum value
    expect(error).toBeDefined();

    // Verify DB state was rolled back - no event created
    const dbEvents = await prisma.progressEvent.findMany({ where: { eventId } });
    expect(dbEvents.length).toBe(0);

    // Verify DB state was rolled back - no audit log created
    const auditLogs = await prisma.auditLog.findMany({ where: { targetId: woId } });
    expect(auditLogs.length).toBe(0);

    // Verify DB state was rolled back - work order status is unchanged
    const wo = await prisma.workOrder.findUnique({ where: { id: woId } });
    expect(wo?.status).toBe('OPEN');
  });
});
