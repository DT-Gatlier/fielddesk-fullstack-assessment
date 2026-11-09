import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app.js';
import { getRedisClient } from '@/infrastructure/redis.js';
import { resetMockWorkOrders, getMockAuditLogs } from '@/infrastructure/db.js';

const app = createApp();

let apexDispatcherToken: string;
let apexOwnerToken: string;
let apexTechToken: string;
let summitDispatcherToken: string;

describe('Feature 02: Work-Order Management, Dashboard & Scoping Isolation', () => {
  beforeEach(async () => {
    // Reset Redis & mock DB state
    const redis = getRedisClient();
    await redis.flushall();
    resetMockWorkOrders();

    // Authenticate personas
    const apexDispRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dispatcher@apex.test', password: 'password123' });
    apexDispatcherToken = apexDispRes.body.accessToken;

    const apexOwnerRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@apex.test', password: 'password123' });
    apexOwnerToken = apexOwnerRes.body.accessToken;

    const apexTechRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'technician@apex.test', password: 'password123' });
    apexTechToken = apexTechRes.body.accessToken;

    const summitDispRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dispatcher@summit.test', password: 'password123' });
    summitDispatcherToken = summitDispRes.body.accessToken;
  });

  describe('1. Work Order Listing, Filtering & Pagination', () => {
    it('returns paginated work orders for Apex organisation', async () => {
      const res = await request(app)
        .get('/api/v1/work-orders?page=1&limit=2')
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.pagination).toMatchObject({
        page: 1,
        limit: 2,
      });
      // All returned records must belong to org-apex-01
      for (const wo of res.body.data) {
        expect(wo.organisationId).toBe('org-apex-01');
      }
    });

    it('filters work orders by status', async () => {
      const res = await request(app)
        .get('/api/v1/work-orders?status=open')
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(res.status).toBe(200);
      for (const wo of res.body.data) {
        expect(wo.status).toBe('open');
      }
    });

    it('filters work orders by search keyword (reference, title, or site)', async () => {
      const res = await request(app)
        .get('/api/v1/work-orders?search=chiller')
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].title.toLowerCase()).toContain('chiller');
    });
  });

  describe('2. Technician Role Scoping Isolation', () => {
    it('automatically scopes technician queries strictly to assigned work orders', async () => {
      const res = await request(app)
        .get('/api/v1/work-orders')
        .set('Authorization', `Bearer ${apexTechToken}`);

      expect(res.status).toBe(200);
      // Tom Technician is assigned to WO-1001 and WO-1002, but NOT WO-1003 (assigned to Tina)
      expect(res.body.data.length).toBe(2);
      for (const wo of res.body.data) {
        expect(wo.assignedTechnicianId).toBe('11111111-1111-1111-1111-111111111103');
      }
    });
  });

  describe('3. Cross-Tenant Anti-Enumeration Isolation (404 Not Found)', () => {
    it('returns 404 Not Found (never 403) when Apex user accesses Summit work order ID', async () => {
      const summitWorkOrderId = '20000000-0000-0000-0000-000000000001';

      const res = await request(app)
        .get(`/api/v1/work-orders/${summitWorkOrderId}`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns work order details with assigned technician and audit trail within same tenant', async () => {
      const apexWorkOrderId = '10000000-0000-0000-0000-000000000001';

      const res = await request(app)
        .get(`/api/v1/work-orders/${apexWorkOrderId}`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(apexWorkOrderId);
      expect(res.body.organisationId).toBe('org-apex-01');
      expect(res.body).toHaveProperty('assignedTechnician');
      expect(res.body.assignedTechnician).toMatchObject({
        id: '11111111-1111-1111-1111-111111111103',
      });
      expect(res.body).toHaveProperty('auditLogs');
    });
  });

  describe('4. Work Order Creation & RBAC Guard', () => {
    it('allows Dispatcher to create work order with auto-generated reference number', async () => {
      const res = await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          title: 'Quarterly Air Duct Sterilization',
          description: 'Disinfect main airflow conduits.',
          priority: 'high',
          siteName: 'Apex Tower North - Wing B',
          scheduledStart: '2026-11-15T09:00:00Z',
          scheduledEnd: '2026-11-15T12:00:00Z',
          technicianId: '11111111-1111-1111-1111-111111111103',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.referenceNumber).toMatch(/^WO-APEX-\d+$/);
      expect(res.body.title).toBe('Quarterly Air Duct Sterilization');
      expect(res.body.organisationId).toBe('org-apex-01');
      expect(res.body.status).toBe('open');
    });

    it('rejects creation when scheduledEnd is before scheduledStart with 422', async () => {
      const res = await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          title: 'Invalid Schedule Test',
          siteName: 'Apex Substation',
          scheduledStart: '2026-11-15T14:00:00Z',
          scheduledEnd: '2026-11-15T12:00:00Z', // End before Start
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects Technician from creating work orders with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${apexTechToken}`)
        .send({
          title: 'Unauthorized Creation',
          siteName: 'Apex Plant',
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('5. Work Order Updates & Audit Logs', () => {
    it('allows Dispatcher to update editable fields of work order', async () => {
      const targetId = '10000000-0000-0000-0000-000000000001';

      const res = await request(app)
        .patch(`/api/v1/work-orders/${targetId}`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          title: 'Updated HVAC Compressor Overhaul',
          priority: 'urgent',
        });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated HVAC Compressor Overhaul');
      expect(res.body.priority).toBe('urgent');

      // Verify audit log was recorded
      const logs = getMockAuditLogs();
      const audit = logs.find((l) => l.target_id === targetId && l.action === 'work_order:updated');
      expect(audit).toBeDefined();
      expect(audit?.organisation_id).toBe('org-apex-01');
    });

    it('rejects Technician from updating work order metadata with 403 Forbidden', async () => {
      const targetId = '10000000-0000-0000-0000-000000000001';

      const res = await request(app)
        .patch(`/api/v1/work-orders/${targetId}`)
        .set('Authorization', `Bearer ${apexTechToken}`)
        .send({ title: 'Tech Illegal Edit' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('6. Dashboard Metrics & Redis Caching', () => {
    it('returns aggregated status counts for organisation', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/metrics')
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('open');
      expect(res.body).toHaveProperty('inProgress');
      expect(res.body).toHaveProperty('blocked');
      expect(res.body).toHaveProperty('completed');
      expect(res.body.total).toBeGreaterThanOrEqual(3);
    });

    it('caches dashboard metrics in Redis with 30s TTL', async () => {
      const redis = getRedisClient();

      await request(app)
        .get('/api/v1/dashboard/metrics')
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      const cachedData = await redis.get('cache:org-apex-01:dashboard:counts:all');
      expect(cachedData).not.toBeNull();
      const parsed = JSON.parse(cachedData!);
      expect(parsed).toHaveProperty('total');

      const ttl = await redis.ttl('cache:org-apex-01:dashboard:counts:all');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30);
    });

    it('scopes dashboard metrics to assigned work orders for technicians', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/metrics')
        .set('Authorization', `Bearer ${apexTechToken}`);

      expect(res.status).toBe(200);
      // Tom Technician is assigned to 2 work orders (1 open, 1 in_progress)
      expect(res.body.total).toBe(2);
      expect(res.body.open).toBe(1);
      expect(res.body.inProgress).toBe(1);
      expect(res.body.completed).toBe(0);
    });
  });

  describe('7. Organisation Technicians List', () => {
    it('allows Dispatcher to list technicians for assignment', async () => {
      const res = await request(app)
        .get('/api/v1/users/technicians')
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('technicians');
      expect(Array.isArray(res.body.technicians)).toBe(true);
      expect(res.body.technicians.length).toBe(2);
      expect(res.body.technicians.map((t: any) => t.name)).toContain('Tom Technician (Apex)');
      expect(res.body.technicians.map((t: any) => t.name)).toContain('Tina Technician (Apex)');
    });
  });
});

