import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app.js';
import {
  createWorkOrderSchema,
  updateWorkOrderSchema,
  assignTechnicianSchema,
  listWorkOrdersQuerySchema,
} from '@/api/dtos/work-order.dto.js';
import { progressEventSchema } from '@/api/dtos/event.dto.js';
import { getRedisClient } from '@/infrastructure/redis.js';
import { resetMockWorkOrders } from '@/infrastructure/db.js';

const app = createApp();

describe('Feature 10 Unit & Integration: Work-Order & Event Validation', () => {
  describe('1. Zod DTO Schema Validation', () => {
    it('accepts a valid createWorkOrderSchema payload', () => {
      const parsed = createWorkOrderSchema.safeParse({
        title: 'Inspect Transformer Coils',
        description: 'Routine oil check',
        priority: 'high',
        siteName: 'Substation East',
        scheduledStart: '2026-11-20T09:00:00Z',
        scheduledEnd: '2026-11-20T11:00:00Z',
      });

      expect(parsed.success).toBe(true);
    });

    it('rejects createWorkOrderSchema with short title, invalid priority, and short siteName', () => {
      const parsed = createWorkOrderSchema.safeParse({
        title: 'Hi',
        priority: 'critical_invalid',
        siteName: 'A',
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        const fields = parsed.error.issues.map((i) => i.path.join('.'));
        expect(fields).toContain('title');
        expect(fields).toContain('priority');
        expect(fields).toContain('siteName');
      }
    });

    it('rejects createWorkOrderSchema when scheduledEnd is before scheduledStart', () => {
      const parsed = createWorkOrderSchema.safeParse({
        title: 'Inspect Condenser Unit',
        priority: 'medium',
        siteName: 'Building B',
        scheduledStart: '2026-11-20T14:00:00Z',
        scheduledEnd: '2026-11-20T10:00:00Z',
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        const fields = parsed.error.issues.map((i) => i.path.join('.'));
        expect(fields).toContain('scheduledEnd');
      }
    });

    it('rejects assignTechnicianSchema when technicianId is not a UUID or end <= start', () => {
      const parsed = assignTechnicianSchema.safeParse({
        technicianId: 'not-a-uuid',
        scheduledStart: '2026-11-20T12:00:00Z',
        scheduledEnd: '2026-11-20T12:00:00Z',
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        const fields = parsed.error.issues.map((i) => i.path.join('.'));
        expect(fields).toContain('technicianId');
        expect(fields).toContain('scheduledEnd');
      }
    });

    it('rejects updateWorkOrderSchema with unsupported status or end before start', () => {
      const invalidStatus = updateWorkOrderSchema.safeParse({
        status: 'archived',
      });
      expect(invalidStatus.success).toBe(false);
      if (!invalidStatus.success) {
        expect(invalidStatus.error.issues.map((i) => i.path.join('.'))).toContain('status');
      }

      const invalidWindow = updateWorkOrderSchema.safeParse({
        scheduledStart: '2026-11-20T15:00:00Z',
        scheduledEnd: '2026-11-20T14:00:00Z',
      });
      expect(invalidWindow.success).toBe(false);
      if (!invalidWindow.success) {
        expect(invalidWindow.error.issues.map((i) => i.path.join('.'))).toContain('scheduledEnd');
      }
    });

    it('enforces listWorkOrdersQuerySchema bounds and defaults', () => {
      const defaults = listWorkOrdersQuerySchema.parse({});
      expect(defaults.page).toBe(1);
      expect(defaults.limit).toBe(10);
      expect(defaults.sortBy).toBe('created_at');
      expect(defaults.sortOrder).toBe('desc');

      const invalidLimit = listWorkOrdersQuerySchema.safeParse({ limit: 500, page: 0 });
      expect(invalidLimit.success).toBe(false);
    });

    it('rejects progressEventSchema with future timestamp beyond clock skew and empty eventId', () => {
      const farFuture = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const parsed = progressEventSchema.safeParse({
        eventId: '',
        workOrderId: 'bad-id',
        type: 'unknown_event',
        occurredAt: farFuture,
        payload: {},
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        const fields = parsed.error.issues.map((i) => i.path.join('.'));
        expect(fields).toContain('eventId');
        expect(fields).toContain('workOrderId');
        expect(fields).toContain('type');
        expect(fields).toContain('occurredAt');
      }
    });
  });

  describe('2. HTTP RFC 7807 Validation Responses', () => {
    let dispatcherToken: string;

    beforeEach(async () => {
      const redis = getRedisClient();
      await redis.flushall();
      resetMockWorkOrders();

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'dispatcher@apex.test', password: 'password123' });
      dispatcherToken = loginRes.body.accessToken;
    });

    it('returns RFC 7807 422 VALIDATION_FAILED when creating work order with invalid payload', async () => {
      const res = await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .set('X-Correlation-ID', 'val-test-01')
        .send({
          title: 'X',
          siteName: '',
          priority: 'emergency',
        });

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        status: 422,
        code: 'VALIDATION_FAILED',
        title: 'Validation Error',
        correlationId: 'val-test-01',
      });
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('returns 422 VALIDATION_FAILED when assigning technician with end time before start time', async () => {
      const res = await request(app)
        .post('/api/v1/work-orders/10000000-0000-0000-0000-000000000001/assign')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          technicianId: '11111111-1111-1111-1111-111111111103',
          scheduledStart: '2026-11-22T15:00:00Z',
          scheduledEnd: '2026-11-22T13:00:00Z',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'scheduledEnd',
          }),
        ])
      );
    });
  });
});
