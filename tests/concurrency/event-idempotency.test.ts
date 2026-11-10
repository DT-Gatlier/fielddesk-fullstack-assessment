import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app.js';
import { getRedisClient } from '@/infrastructure/redis.js';
import {
  resetMockWorkOrders,
  resetMockProcessedEvents,
  getMockProcessedEvents,
  getMockAuditLogs,
} from '@/infrastructure/db.js';

const app = createApp();

let apexDispatcherToken: string;
let apexTech1Token: string;
let summitDispatcherToken: string;

const APEX_WO_ASSIGNED_TO_TECH1 = '10000000-0000-0000-0000-000000000001'; // WO-APEX-1001 (assigned to Tom)
const APEX_WO_ASSIGNED_TO_TECH2 = '10000000-0000-0000-0000-000000000003'; // WO-APEX-1003 (assigned to Tina)

describe('Feature 04: Progress-Event API & Idempotency Engine', () => {
  beforeEach(async () => {
    const redis = getRedisClient();
    await redis.flushall();
    resetMockWorkOrders();
    resetMockProcessedEvents();

    const apexDispRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dispatcher@apex.test', password: 'password123' });
    apexDispatcherToken = apexDispRes.body.accessToken;

    const apexTechRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'technician@apex.test', password: 'password123' });
    apexTech1Token = apexTechRes.body.accessToken;

    const summitDispRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dispatcher@summit.test', password: 'password123' });
    summitDispatcherToken = summitDispRes.body.accessToken;
  });

  describe('1. Idempotency & Duplicate Protection', () => {
    it('handles concurrent identical event submissions safely (1 applied, 1 duplicate_ignored)', async () => {
      const eventId = 'evt-dup-999';
      const eventPayload = {
        eventId,
        workOrderId: APEX_WO_ASSIGNED_TO_TECH1,
        type: 'status_changed',
        occurredAt: new Date().toISOString(),
        payload: {
          status: 'in_progress',
          note: 'Started HVAC calibration on site.',
        },
      };

      // Issue 2 simultaneous requests with the exact same eventId
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/v1/work-orders/${APEX_WO_ASSIGNED_TO_TECH1}/events`)
          .set('Authorization', `Bearer ${apexTech1Token}`)
          .send(eventPayload),
        request(app)
          .post(`/api/v1/work-orders/${APEX_WO_ASSIGNED_TO_TECH1}/events`)
          .set('Authorization', `Bearer ${apexTech1Token}`)
          .send(eventPayload),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const statuses = [res1.body.status, res2.body.status].sort();
      expect(statuses).toEqual(['applied', 'duplicate_ignored']);

      const appliedRes = res1.body.status === 'applied' ? res1 : res2;
      const dupRes = res1.body.status === 'duplicate_ignored' ? res1 : res2;

      expect(appliedRes.body).toMatchObject({
        status: 'applied',
        eventId,
        workOrderId: APEX_WO_ASSIGNED_TO_TECH1,
        newStatus: 'in_progress',
      });
      expect(appliedRes.body).toHaveProperty('processedAt');

      expect(dupRes.body).toMatchObject({
        status: 'duplicate_ignored',
        eventId,
      });

      // Verify database processed_events table has EXACTLY 1 recorded row
      const processedEvents = getMockProcessedEvents();
      const matchingEvents = processedEvents.filter((e) => e.event_id === eventId);
      expect(matchingEvents.length).toBe(1);

      // Verify audit logs have EXACTLY 1 entry for this event
      const auditLogs = getMockAuditLogs();
      const matchingAudits = auditLogs.filter(
        (a) => a.action === 'STATUS_CHANGED_VIA_EVENT' && a.metadata?.eventId === eventId
      );
      expect(matchingAudits.length).toBe(1);
    });

    it('returns duplicate_ignored for sequential duplicate submission', async () => {
      const eventId = 'evt-seq-001';
      const eventPayload = {
        eventId,
        workOrderId: APEX_WO_ASSIGNED_TO_TECH1,
        type: 'status_changed',
        occurredAt: new Date().toISOString(),
        payload: {
          status: 'in_progress',
          note: 'First arrival note',
        },
      };

      // 1. Initial submission
      const firstRes = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_ASSIGNED_TO_TECH1}/events`)
        .set('Authorization', `Bearer ${apexTech1Token}`)
        .send(eventPayload);

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.status).toBe('applied');

      // 2. Immediate duplicate re-submission
      const secondRes = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_ASSIGNED_TO_TECH1}/events`)
        .set('Authorization', `Bearer ${apexTech1Token}`)
        .send(eventPayload);

      expect(secondRes.status).toBe(200);
      expect(secondRes.body).toMatchObject({
        status: 'duplicate_ignored',
        eventId,
        message: 'Event was previously processed. No changes applied.',
      });
    });
  });

  describe('2. Technician Authorization & Role Scoping', () => {
    it('allows assigned technician to submit progress events', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_ASSIGNED_TO_TECH1}/events`)
        .set('Authorization', `Bearer ${apexTech1Token}`)
        .send({
          eventId: 'evt-valid-tech-01',
          workOrderId: APEX_WO_ASSIGNED_TO_TECH1,
          type: 'status_changed',
          occurredAt: new Date().toISOString(),
          payload: {
            status: 'in_progress',
            note: 'Commenced filter replacement.',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('applied');
    });

    it('rejects technician from submitting progress events for unassigned work orders with 403 Forbidden', async () => {
      // Tech 1 attempting to update WO assigned to Tech 2 (Tina)
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_ASSIGNED_TO_TECH2}/events`)
        .set('Authorization', `Bearer ${apexTech1Token}`)
        .send({
          eventId: 'evt-unauth-tech-02',
          workOrderId: APEX_WO_ASSIGNED_TO_TECH2,
          type: 'status_changed',
          occurredAt: new Date().toISOString(),
          payload: {
            status: 'in_progress',
          },
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect(res.body.detail).toContain('assigned to them');
    });

    it('allows dispatchers to submit progress events on behalf of technicians', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_ASSIGNED_TO_TECH1}/events`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          eventId: 'evt-disp-override-01',
          workOrderId: APEX_WO_ASSIGNED_TO_TECH1,
          type: 'status_changed',
          occurredAt: new Date().toISOString(),
          payload: {
            status: 'blocked',
            note: 'Parts unavailable on site. Dispatched expedited shipment.',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('applied');
      expect(res.body.newStatus).toBe('blocked');
    });
  });

  describe('3. Multi-Tenant Anti-Enumeration & Invariants', () => {
    it('returns 404 Not Found when attempting to submit event for another tenant work order', async () => {
      // Summit dispatcher attempting to submit event for Apex work order
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_ASSIGNED_TO_TECH1}/events`)
        .set('Authorization', `Bearer ${summitDispatcherToken}`)
        .send({
          eventId: 'evt-cross-tenant-99',
          workOrderId: APEX_WO_ASSIGNED_TO_TECH1,
          type: 'status_changed',
          occurredAt: new Date().toISOString(),
          payload: {
            status: 'completed',
          },
        });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('rejects future occurredAt timestamp with 422 Unprocessable Entity', async () => {
      const futureDate = new Date(Date.now() + 86400 * 1000).toISOString(); // Tomorrow
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_ASSIGNED_TO_TECH1}/events`)
        .set('Authorization', `Bearer ${apexTech1Token}`)
        .send({
          eventId: 'evt-future-time-01',
          workOrderId: APEX_WO_ASSIGNED_TO_TECH1,
          type: 'status_changed',
          occurredAt: futureDate,
          payload: {
            status: 'completed',
          },
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects mismatched workOrderId in URL vs body with 422 Unprocessable Entity', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_ASSIGNED_TO_TECH1}/events`)
        .set('Authorization', `Bearer ${apexTech1Token}`)
        .send({
          eventId: 'evt-mismatched-id-01',
          workOrderId: '20000000-0000-0000-0000-000000000001', // Different ID in body
          type: 'status_changed',
          occurredAt: new Date().toISOString(),
          payload: {
            status: 'in_progress',
          },
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });
});

