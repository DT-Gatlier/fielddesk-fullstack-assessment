import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app.js';
import { getRedisClient } from '@/infrastructure/redis.js';
import { resetMockWorkOrders, clearMockAuditLogs } from '@/infrastructure/db.js';
import { auditService } from '@/services/audit.service.js';
import { notificationTrackerService } from '@/workers/services/notification-tracker.service.js';

const app = createApp();

let apexDispatcherToken: string;
let apexTechToken: string;
let apexOtherTechToken: string;
let summitDispatcherToken: string;

const APEX_WO_1 = '10000000-0000-0000-0000-000000000001'; // Assigned to Tom Tech
const APEX_WO_3 = '10000000-0000-0000-0000-000000000003'; // Assigned to Tina Tech
const SUMMIT_WO_1 = '20000000-0000-0000-0000-000000000001'; // Summit Org
const APEX_TECH_ID = '11111111-1111-1111-1111-111111111103'; // Tom Tech

describe('Feature 08: Immutable Audit History & Activity Timeline Isolation', () => {
  beforeEach(async () => {
    const redis = getRedisClient();
    await redis.flushall();
    resetMockWorkOrders();
    clearMockAuditLogs();

    const apexDispRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dispatcher@apex.test', password: 'password123' });
    apexDispatcherToken = apexDispRes.body.accessToken;

    const apexTechRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'technician@apex.test', password: 'password123' });
    apexTechToken = apexTechRes.body.accessToken;

    const apexOtherTechRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'technician2@apex.test', password: 'password123' });
    apexOtherTechToken = apexOtherTechRes.body.accessToken;

    const summitDispRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dispatcher@summit.test', password: 'password123' });
    summitDispatcherToken = summitDispRes.body.accessToken;
  });

  describe('1. Tenant Isolation & Authorization Guards', () => {
    it('rejects unauthenticated requests to /activity with 401 Unauthorized', async () => {
      const res = await request(app).get(`/api/v1/work-orders/${APEX_WO_1}/activity`);
      expect(res.status).toBe(401);
    });

    it('returns 404 Not Found (anti-enumeration) when Apex user queries Summit work order activity', async () => {
      const res = await request(app)
        .get(`/api/v1/work-orders/${SUMMIT_WO_1}/activity`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 403 Forbidden when Technician queries unassigned work order activity', async () => {
      // APEX_WO_3 is assigned to Tina, not Tom
      const res = await request(app)
        .get(`/api/v1/work-orders/${APEX_WO_3}/activity`)
        .set('Authorization', `Bearer ${apexTechToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('allows assigned Technician to retrieve activity timeline for their work order', async () => {
      const res = await request(app)
        .get(`/api/v1/work-orders/${APEX_WO_1}/activity`)
        .set('Authorization', `Bearer ${apexTechToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('2. Lifecycle Action Tracking & State Diffs', () => {
    it('records WORK_ORDER_CREATED with actor details and initial state', async () => {
      const createRes = await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          title: 'Compressor Audit Test',
          priority: 'high',
          siteName: 'Apex Plant North',
        });

      expect(createRes.status).toBe(201);
      const workOrderId = createRes.body.id;

      const activityRes = await request(app)
        .get(`/api/v1/work-orders/${workOrderId}/activity`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(activityRes.status).toBe(200);
      expect(activityRes.body.length).toBe(1);
      const entry = activityRes.body[0];
      expect(entry.action).toBe('WORK_ORDER_CREATED');
      expect(entry.targetId).toBe(workOrderId);
      expect(entry.actor.name).toContain('David Dispatcher');
      expect(entry.afterState).toMatchObject({
        title: 'Compressor Audit Test',
        priority: 'high',
        siteName: 'Apex Plant North',
      });
    });

    it('records WORK_ORDER_STATUS_UPDATED with before/after diff on status update', async () => {
      const patchRes = await request(app)
        .patch(`/api/v1/work-orders/${APEX_WO_1}`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({ status: 'in_progress' });

      expect(patchRes.status).toBe(200);

      const activityRes = await request(app)
        .get(`/api/v1/work-orders/${APEX_WO_1}/activity`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(activityRes.status).toBe(200);
      const statusEntry = activityRes.body.find((e: any) => e.action === 'WORK_ORDER_STATUS_UPDATED');
      expect(statusEntry).toBeDefined();
      expect(statusEntry.beforeState).toMatchObject({ status: 'open' });
      expect(statusEntry.afterState).toMatchObject({ status: 'in_progress' });
      expect(statusEntry.actor.name).toContain('David Dispatcher');
    });

    it('records WORK_ORDER_ASSIGNED with technician name and schedule window', async () => {
      const assignRes = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/assign`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          technicianId: APEX_TECH_ID,
          scheduledStart: '2026-11-15T10:00:00.000Z',
          scheduledEnd: '2026-11-15T12:00:00.000Z',
        });

      expect(assignRes.status).toBe(200);

      const activityRes = await request(app)
        .get(`/api/v1/work-orders/${APEX_WO_1}/activity`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      const assignEntry = activityRes.body.find((e: any) => e.action === 'WORK_ORDER_ASSIGNED');
      expect(assignEntry).toBeDefined();
      expect(assignEntry.afterState.assignedTechnicianId).toBe(APEX_TECH_ID);
      expect(assignEntry.afterState.assignedTechnicianName).toContain('Tom Technician');
    });

    it('records STATUS_CHANGED_VIA_EVENT with note when progress event is submitted', async () => {
      const eventRes = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/events`)
        .set('Authorization', `Bearer ${apexTechToken}`)
        .send({
          eventId: 'evt-audit-check-1',
          workOrderId: APEX_WO_1,
          type: 'status_changed',
          occurredAt: new Date(Date.now() - 5000).toISOString(),
          payload: {
            status: 'blocked',
            note: 'Waiting for spare parts',
          },
        });

      expect(eventRes.status).toBe(200);

      const activityRes = await request(app)
        .get(`/api/v1/work-orders/${APEX_WO_1}/activity`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      const eventEntry = activityRes.body.find((e: any) => e.action === 'STATUS_CHANGED_VIA_EVENT');
      expect(eventEntry).toBeDefined();
      expect(eventEntry.beforeState).toEqual({ status: 'open' });
      expect(eventEntry.afterState).toEqual({
        status: 'blocked',
        note: 'Waiting for spare parts',
      });
      expect(eventEntry.actor.name).toContain('Tom Technician');
    });

    it('attributes worker notification logs to System Worker when actor_id is null', async () => {
      await notificationTrackerService.recordAudit({
        organisationId: 'org-apex-01',
        workOrderId: APEX_WO_1,
        technicianId: APEX_TECH_ID,
        action: 'NOTIFICATION_DELIVERED',
        attempt: 1,
        provider: 'MockNotificationProvider',
        deliveredAt: new Date(),
      });

      const activityRes = await request(app)
        .get(`/api/v1/work-orders/${APEX_WO_1}/activity`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      const notifEntry = activityRes.body.find((e: any) => e.action === 'NOTIFICATION_DELIVERED');
      expect(notifEntry).toBeDefined();
      expect(notifEntry.actor).toEqual({ id: null, name: 'System Worker' });
      expect(notifEntry.metadata.attempt).toBe(1);
    });
  });

  describe('3. Strict Immutability & Append-Only Guarantees', () => {
    it('does not expose any UPDATE or DELETE endpoints for audit logs or activity', async () => {
      const patchRes = await request(app)
        .patch(`/api/v1/work-orders/${APEX_WO_1}/activity`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({ action: 'TAMPERED' });
      expect(patchRes.status).toBe(404);

      const putRes = await request(app)
        .put(`/api/v1/work-orders/${APEX_WO_1}/activity`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({ action: 'TAMPERED' });
      expect(putRes.status).toBe(404);

      const deleteRes = await request(app)
        .delete(`/api/v1/work-orders/${APEX_WO_1}/activity`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`);
      expect(deleteRes.status).toBe(404);

      const deleteAuditLogsRes = await request(app)
        .delete('/api/v1/audit-logs/audit-1')
        .set('Authorization', `Bearer ${apexDispatcherToken}`);
      expect(deleteAuditLogsRes.status).toBe(404);
    });

    it('exposes only append-only record and getActivity methods on auditService', () => {
      expect(typeof auditService.record).toBe('function');
      expect(typeof auditService.getActivity).toBe('function');
      expect((auditService as any).update).toBeUndefined();
      expect((auditService as any).delete).toBeUndefined();
    });
  });
});
