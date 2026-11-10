import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app.js';
import { getRedisClient } from '@/infrastructure/redis.js';
import { resetMockWorkOrders, getMockAuditLogs } from '@/infrastructure/db.js';
import { notificationQueue } from '@/infrastructure/queue.js';

const app = createApp();

let apexDispatcherToken: string;
let apexTechToken: string;
let summitDispatcherToken: string;

const APEX_TECH_ID = '11111111-1111-1111-1111-111111111103';
const SUMMIT_TECH_ID = '22222222-2222-2222-2222-222222222203';

describe('Feature 03: Scheduling & Concurrency Conflict Engine', () => {
  beforeEach(async () => {
    const redis = getRedisClient();
    await redis.flushall();
    resetMockWorkOrders();
    notificationQueue.clear();

    const apexDispRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dispatcher@apex.test', password: 'password123' });
    apexDispatcherToken = apexDispRes.body.accessToken;

    const apexTechRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'technician@apex.test', password: 'password123' });
    apexTechToken = apexTechRes.body.accessToken;

    const summitDispRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dispatcher@summit.test', password: 'password123' });
    summitDispatcherToken = summitDispRes.body.accessToken;
  });

  describe('1. Simultaneous Concurrent Requests (Race Condition Protection)', () => {
    it('handles simultaneous overlapping requests with exactly 1 success (200) and 1 conflict (409)', async () => {
      // 1. Create 2 unassigned work orders for Apex
      const wo1Res = await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          title: 'Emergency Generator Maintenance A',
          siteName: 'Apex Data Center A',
          priority: 'urgent',
        });
      expect(wo1Res.status).toBe(201);
      const wo1Id = wo1Res.body.id;

      const wo2Res = await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          title: 'Emergency Generator Maintenance B',
          siteName: 'Apex Data Center B',
          priority: 'urgent',
        });
      expect(wo2Res.status).toBe(201);
      const wo2Id = wo2Res.body.id;

      // 2. Issue 2 simultaneous conflicting assignment requests for the same technician
      const slotStart = '2026-11-15T10:00:00.000Z';
      const slotEnd = '2026-11-15T12:00:00.000Z';

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/v1/work-orders/${wo1Id}/assign`)
          .set('Authorization', `Bearer ${apexDispatcherToken}`)
          .send({
            technicianId: APEX_TECH_ID,
            scheduledStart: slotStart,
            scheduledEnd: slotEnd,
          }),
        request(app)
          .post(`/api/v1/work-orders/${wo2Id}/assign`)
          .set('Authorization', `Bearer ${apexDispatcherToken}`)
          .send({
            technicianId: APEX_TECH_ID,
            scheduledStart: slotStart,
            scheduledEnd: slotEnd,
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const successRes = res1.status === 200 ? res1 : res2;
      const conflictRes = res1.status === 409 ? res1 : res2;

      // Assert successful response
      expect(successRes.body).toHaveProperty('id');
      expect(successRes.body.assignedTechnicianId).toBe(APEX_TECH_ID);
      expect(new Date(successRes.body.scheduledStart).toISOString()).toBe(slotStart);
      expect(new Date(successRes.body.scheduledEnd).toISOString()).toBe(slotEnd);

      // Assert 409 conflict response
      expect(conflictRes.body).toMatchObject({
        status: 409,
        code: 'SCHEDULING_CONFLICT',
        title: 'Scheduling Conflict',
      });
      expect(conflictRes.body).toHaveProperty('conflictingWorkOrder');
      expect(conflictRes.body.conflictingWorkOrder).toHaveProperty('referenceNumber');
      expect(new Date(conflictRes.body.conflictingWorkOrder.scheduledStart).toISOString()).toBe(slotStart);
      expect(new Date(conflictRes.body.conflictingWorkOrder.scheduledEnd).toISOString()).toBe(slotEnd);

      // Verify notification queue has exactly 1 job enqueued for the successful assignment
      const jobs = notificationQueue.getJobs();
      expect(jobs.length).toBe(1);
      expect(jobs[0].data.technicianId).toBe(APEX_TECH_ID);
    });
  });

  describe('2. Interval Overlap Matrix [scheduled_start, scheduled_end)', () => {
    it('detects partial forward overlap (10:00-12:00 vs 11:00-13:00) with 409 Conflict', async () => {
      // wo1 is assigned 10:00 to 12:00
      const wo1 = await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({ title: 'Slot 1 Work Order', siteName: 'Site 1', priority: 'medium' });

      await request(app)
        .post(`/api/v1/work-orders/${wo1.body.id}/assign`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          technicianId: APEX_TECH_ID,
          scheduledStart: '2026-11-16T10:00:00.000Z',
          scheduledEnd: '2026-11-16T12:00:00.000Z',
        });

      // wo2 attempts 11:00 to 13:00 for same technician
      const wo2 = await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({ title: 'Slot 2 Work Order', siteName: 'Site 2', priority: 'medium' });

      const res = await request(app)
        .post(`/api/v1/work-orders/${wo2.body.id}/assign`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          technicianId: APEX_TECH_ID,
          scheduledStart: '2026-11-16T11:00:00.000Z',
          scheduledEnd: '2026-11-16T13:00:00.000Z',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SCHEDULING_CONFLICT');
      expect(res.body.conflictingWorkOrder.referenceNumber).toBe(wo1.body.referenceNumber);
    });

    it('allows adjacent non-overlapping schedules (10:00-12:00 and 12:00-14:00)', async () => {
      const wo1 = await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({ title: 'Adjacent 1', siteName: 'Site 1', priority: 'medium' });

      const assign1 = await request(app)
        .post(`/api/v1/work-orders/${wo1.body.id}/assign`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          technicianId: APEX_TECH_ID,
          scheduledStart: '2026-11-17T10:00:00.000Z',
          scheduledEnd: '2026-11-17T12:00:00.000Z',
        });
      expect(assign1.status).toBe(200);

      // wo2 starts exactly when wo1 ends: [10:00, 12:00) && [12:00, 14:00) -> NO OVERLAP
      const wo2 = await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({ title: 'Adjacent 2', siteName: 'Site 2', priority: 'medium' });

      const assign2 = await request(app)
        .post(`/api/v1/work-orders/${wo2.body.id}/assign`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          technicianId: APEX_TECH_ID,
          scheduledStart: '2026-11-17T12:00:00.000Z',
          scheduledEnd: '2026-11-17T14:00:00.000Z',
        });
      expect(assign2.status).toBe(200);
    });

    it('ignores completed and cancelled work orders during conflict detection', async () => {
      // WO-APEX-1003 is already completed (08:00 to 10:00 on 2026-11-09) assigned to Tina (11111111-1111-1111-1111-111111111104)
      const TINA_TECH_ID = '11111111-1111-1111-1111-111111111104';

      const wo = await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({ title: 'New Job in Same Window', siteName: 'Site 3', priority: 'low' });

      const res = await request(app)
        .post(`/api/v1/work-orders/${wo.body.id}/assign`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          technicianId: TINA_TECH_ID,
          scheduledStart: '2026-11-09T08:00:00.000Z',
          scheduledEnd: '2026-11-09T10:00:00.000Z',
        });

      // Because the prior order is completed, assignment should succeed
      expect(res.status).toBe(200);
    });
  });

  describe('3. Security, RBAC & Multi-Tenant Boundaries', () => {
    it('rejects Technician role from assigning work orders with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/work-orders/10000000-0000-0000-0000-000000000001/assign')
        .set('Authorization', `Bearer ${apexTechToken}`)
        .send({
          technicianId: APEX_TECH_ID,
          scheduledStart: '2026-11-20T10:00:00.000Z',
          scheduledEnd: '2026-11-20T12:00:00.000Z',
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('returns 404 Not Found when attempting to assign a work order belonging to another tenant', async () => {
      // Summit dispatcher attempting to assign Apex work order
      const res = await request(app)
        .post('/api/v1/work-orders/10000000-0000-0000-0000-000000000001/assign')
        .set('Authorization', `Bearer ${summitDispatcherToken}`)
        .send({
          technicianId: SUMMIT_TECH_ID,
          scheduledStart: '2026-11-20T10:00:00.000Z',
          scheduledEnd: '2026-11-20T12:00:00.000Z',
        });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 404 Not Found when attempting to assign a technician belonging to another tenant', async () => {
      // Apex dispatcher attempting to assign Summit technician to Apex work order
      const res = await request(app)
        .post('/api/v1/work-orders/10000000-0000-0000-0000-000000000001/assign')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          technicianId: SUMMIT_TECH_ID,
          scheduledStart: '2026-11-20T10:00:00.000Z',
          scheduledEnd: '2026-11-20T12:00:00.000Z',
        });

      expect(res.status).toBe(404);
      expect(res.body.detail).toContain('Technician not found');
    });

    it('rejects invalid scheduling intervals (end before start) with 422 Unprocessable Entity', async () => {
      const res = await request(app)
        .post('/api/v1/work-orders/10000000-0000-0000-0000-000000000001/assign')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          technicianId: APEX_TECH_ID,
          scheduledStart: '2026-11-20T12:00:00.000Z',
          scheduledEnd: '2026-11-20T10:00:00.000Z',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });
});

