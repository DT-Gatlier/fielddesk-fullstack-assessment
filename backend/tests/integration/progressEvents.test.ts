import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role, EventType } from '@prisma/client';
import { ProgressEventService } from '../../src/services/progressEvent.service';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();
const progressEventService = new ProgressEventService();

describe('Progress Event Idempotency & Concurrency', () => {
  let orgId: string;
  let technicianId: string;
  let woId: string;

  beforeAll(async () => {
    const org = await prisma.organisation.create({
      data: { name: 'Test Org 2', slug: `test2-${uuidv4()}`, storageLimitBytes: 1000 },
    });
    orgId = org.id;

    const tech = await prisma.user.create({
      data: { email: `tech2-${uuidv4()}@test.com`, passwordHash: 'hash', role: Role.TECHNICIAN, orgId },
    });
    technicianId = tech.id;

    const wo = await prisma.workOrder.create({
      data: { orgId, referenceNumber: `WO3-${uuidv4()}`, title: 'W3', description: 'D3', siteName: 'S3', createdBy: technicianId },
    });
    woId = wo.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('handles simultaneous duplicate event submissions safely', async () => {
    const eventId = uuidv4();
    const eventData = {
      eventId,
      workOrderId: woId,
      type: EventType.STATUS_CHANGED,
      occurredAt: new Date(),
      payload: { status: 'IN_PROGRESS' },
    };

    // Simulate clicking "Submit" 3 times instantly
    const req1 = progressEventService.submitEvent(orgId, eventData, technicianId, 'TECHNICIAN');
    const req2 = progressEventService.submitEvent(orgId, eventData, technicianId, 'TECHNICIAN');
    const req3 = progressEventService.submitEvent(orgId, eventData, technicianId, 'TECHNICIAN');

    const results = await Promise.allSettled([req1, req2, req3]);

    // All should succeed in returning an event, but only ONE should actually be processed (isDuplicate: false)
    const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    
    expect(fulfilled.length).toBe(3); // All requests succeed from client's perspective
    
    const newEvents = fulfilled.filter(r => r.value.isDuplicate === false);
    const duplicates = fulfilled.filter(r => r.value.isDuplicate === true);

    expect(newEvents.length).toBe(1);
    expect(duplicates.length).toBe(2);

    // Verify DB state
    const dbEvents = await prisma.progressEvent.findMany({ where: { eventId } });
    expect(dbEvents.length).toBe(1);

    const wo = await prisma.workOrder.findUnique({ where: { id: woId } });
    expect(wo?.status).toBe('IN_PROGRESS');
  });
});
