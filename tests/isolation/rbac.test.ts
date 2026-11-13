import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app.js';
import { getRedisClient } from '@/infrastructure/redis.js';
import { resetMockWorkOrders } from '@/infrastructure/db.js';

const app = createApp();

describe('Feature 10 Security: Role-Based Access Control (RBAC) Matrix', () => {
  let apexOwnerToken: string;
  let apexDispatcherToken: string;
  let apexTomTechToken: string;
  let apexTinaTechToken: string;

  beforeEach(async () => {
    const redis = getRedisClient();
    await redis.flushall();
    resetMockWorkOrders();

    const [ownerRes, dispRes, tomRes, tinaRes] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ email: 'owner@apex.test', password: 'password123' }),
      request(app).post('/api/v1/auth/login').send({ email: 'dispatcher@apex.test', password: 'password123' }),
      request(app).post('/api/v1/auth/login').send({ email: 'technician@apex.test', password: 'password123' }),
      request(app).post('/api/v1/auth/login').send({ email: 'technician2@apex.test', password: 'password123' }),
    ]);

    apexOwnerToken = ownerRes.body.accessToken;
    apexDispatcherToken = dispRes.body.accessToken;
    apexTomTechToken = tomRes.body.accessToken;
    apexTinaTechToken = tinaRes.body.accessToken;
  });

  it('blocks technicians with 403 RFC 7807 on privileged management endpoints', async () => {
    const createRes = await request(app)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${apexTomTechToken}`)
      .send({ title: 'Unauthorized Create', priority: 'medium', siteName: 'Main Site' });
    expect(createRes.status).toBe(403);
    expect(createRes.body.code).toBe('FORBIDDEN');

    const updateRes = await request(app)
      .patch('/api/v1/work-orders/10000000-0000-0000-0000-000000000001')
      .set('Authorization', `Bearer ${apexTomTechToken}`)
      .send({ priority: 'urgent' });
    expect(updateRes.status).toBe(403);
    expect(updateRes.body.code).toBe('FORBIDDEN');

    const assignRes = await request(app)
      .post('/api/v1/work-orders/10000000-0000-0000-0000-000000000001/assign')
      .set('Authorization', `Bearer ${apexTomTechToken}`)
      .send({
        technicianId: '11111111-1111-1111-1111-111111111103',
        scheduledStart: '2026-12-01T09:00:00Z',
        scheduledEnd: '2026-12-01T11:00:00Z',
      });
    expect(assignRes.status).toBe(403);
    expect(assignRes.body.code).toBe('FORBIDDEN');

    const csvRes = await request(app)
      .get('/api/v1/work-orders/export/csv')
      .set('Authorization', `Bearer ${apexTomTechToken}`);
    expect(csvRes.status).toBe(403);
    expect(csvRes.body.code).toBe('FORBIDDEN');

    const techsRes = await request(app)
      .get('/api/v1/users/technicians')
      .set('Authorization', `Bearer ${apexTomTechToken}`);
    expect(techsRes.status).toBe(403);
    expect(techsRes.body.code).toBe('FORBIDDEN');
  });

  it('prevents an unassigned technician from viewing or mutating a peer technician work order', async () => {
    // WO-APEX-1001 is assigned to Tom (1111...1103), NOT Tina (1111...1104)
    const activityRes = await request(app)
      .get('/api/v1/work-orders/10000000-0000-0000-0000-000000000001/activity')
      .set('Authorization', `Bearer ${apexTinaTechToken}`);
    expect(activityRes.status).toBe(403);

    const eventRes = await request(app)
      .post('/api/v1/work-orders/10000000-0000-0000-0000-000000000001/events')
      .set('Authorization', `Bearer ${apexTinaTechToken}`)
      .send({
        eventId: 'evt-rbac-unassigned-1',
        workOrderId: '10000000-0000-0000-0000-000000000001',
        type: 'note_added',
        occurredAt: new Date().toISOString(),
        payload: { note: 'Unauthorized update attempt' },
      });
    expect(eventRes.status).toBe(403);
  });

  it('permits Owners and Dispatchers to manage work orders, view team roster, and export CSV', async () => {
    const ownerCreateRes = await request(app)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${apexOwnerToken}`)
      .send({ title: 'Owner Scheduled Inspection', priority: 'low', siteName: 'HQ Roof' });
    expect(ownerCreateRes.status).toBe(201);

    const dispTechsRes = await request(app)
      .get('/api/v1/users/technicians')
      .set('Authorization', `Bearer ${apexDispatcherToken}`);
    expect(dispTechsRes.status).toBe(200);
    expect(dispTechsRes.body.technicians.length).toBeGreaterThanOrEqual(2);

    const ownerPermsRes = await request(app)
      .get('/api/v1/auth/permissions')
      .set('Authorization', `Bearer ${apexOwnerToken}`);
    expect(ownerPermsRes.status).toBe(200);
    expect(ownerPermsRes.body.role).toBe('owner');
    expect(ownerPermsRes.body.permissions).toContain('org:manage_settings');

    const techPermsRes = await request(app)
      .get('/api/v1/auth/permissions')
      .set('Authorization', `Bearer ${apexTomTechToken}`);
    expect(techPermsRes.status).toBe(200);
    expect(techPermsRes.body.permissions).not.toContain('org:manage_settings');
    expect(techPermsRes.body.permissions).not.toContain('work_orders:create');
  });
});

