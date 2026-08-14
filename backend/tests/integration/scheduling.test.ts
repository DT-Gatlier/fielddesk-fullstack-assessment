import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role, Priority, Status } from '@prisma/client';
import { WorkOrderService } from '../../src/services/workOrder.service';
import { v4 as uuidv4 } from 'uuid';
import { vi } from 'vitest';

vi.mock('../../src/utils/queue', () => ({
  notificationQueue: {
    add: vi.fn(),
  }
}));

const prisma = new PrismaClient();
const workOrderService = new WorkOrderService();

describe('Concurrent Scheduling & Overlap Prevention', () => {
  let orgId: string;
  let dispatcherId: string;
  let technicianId: string;
  let wo1Id: string;
  let wo2Id: string;

  beforeAll(async () => {
    // Setup org and users
    const org = await prisma.organisation.create({
      data: { name: 'Test Org', slug: `test-${uuidv4()}`, storageLimitBytes: 1000 },
    });
    orgId = org.id;

    const dispatcher = await prisma.user.create({
      data: { email: `disp-${uuidv4()}@test.com`, passwordHash: 'hash', role: Role.DISPATCHER, orgId },
    });
    dispatcherId = dispatcher.id;

    const tech = await prisma.user.create({
      data: { email: `tech-${uuidv4()}@test.com`, passwordHash: 'hash', role: Role.TECHNICIAN, orgId },
    });
    technicianId = tech.id;

    // Setup 2 work orders
    const wo1 = await prisma.workOrder.create({
      data: { orgId, referenceNumber: `WO1-${uuidv4()}`, title: 'W1', description: 'D1', siteName: 'S1', createdBy: dispatcherId },
    });
    wo1Id = wo1.id;

    const wo2 = await prisma.workOrder.create({
      data: { orgId, referenceNumber: `WO2-${uuidv4()}`, title: 'W2', description: 'D2', siteName: 'S2', createdBy: dispatcherId },
    });
    wo2Id = wo2.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('prevents overlapping assignments under concurrency', async () => {
    // Both assignments try to schedule the technician for overlapping time slots
    const start = new Date('2030-01-01T10:00:00Z');
    const end = new Date('2030-01-01T12:00:00Z');

    const assignment1 = workOrderService.assignTechnician(orgId, wo1Id, technicianId, start, end, dispatcherId);
    
    // Slightly offset but still overlapping
    const start2 = new Date('2030-01-01T11:00:00Z');
    const end2 = new Date('2030-01-01T13:00:00Z');
    const assignment2 = workOrderService.assignTechnician(orgId, wo2Id, technicianId, start2, end2, dispatcherId);

    // Run them concurrently
    const results = await Promise.allSettled([assignment1, assignment2]);

    // One must succeed, one must fail with ConflictError
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    if (rejected[0].status === 'rejected') {
      expect(rejected[0].reason.message).toContain('Scheduling conflict');
    }
  });
});
