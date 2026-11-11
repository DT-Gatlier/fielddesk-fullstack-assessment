import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app.js';
import { getRedisClient } from '@/infrastructure/redis.js';
import { resetMockWorkOrders, clearMockAuditLogs } from '@/infrastructure/db.js';
import { sanitizeCsvField } from '@/services/report.service.js';

const app = createApp();

let apexOwnerToken: string;
let apexDispatcherToken: string;
let apexTechToken: string;
let summitDispatcherToken: string;

describe('Feature 09: Reporting & Secure CSV Export Isolation', () => {
  beforeEach(async () => {
    const redis = getRedisClient();
    await redis.flushall();
    resetMockWorkOrders();
    clearMockAuditLogs();

    const apexOwnerRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@apex.test', password: 'password123' });
    apexOwnerToken = apexOwnerRes.body.accessToken;

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

  describe('1. Authentication, RBAC & Response Headers', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/work-orders/export/csv');
      expect(res.status).toBe(401);
    });

    it('rejects Technician role from exporting work orders CSV with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/work-orders/export/csv')
        .set('Authorization', `Bearer ${apexTechToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('allows Owner and Dispatcher and sets CSV streaming headers', async () => {
      const dispRes = await request(app)
        .get('/api/v1/work-orders/export/csv')
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(dispRes.status).toBe(200);
      expect(dispRes.headers['content-type']).toContain('text/csv');
      expect(dispRes.headers['content-disposition']).toMatch(
        /^attachment; filename="work-orders-export-\d{4}-\d{2}-\d{2}\.csv"$/
      );

      const ownerRes = await request(app)
        .get('/api/v1/work-orders/export/csv')
        .set('Authorization', `Bearer ${apexOwnerToken}`);
      expect(ownerRes.status).toBe(200);
    });
  });

  describe('2. Multi-Tenant Organisation Isolation', () => {
    it('exports ONLY Apex work orders for Apex Dispatcher with ZERO Summit records', async () => {
      const res = await request(app)
        .get('/api/v1/work-orders/export/csv')
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(res.status).toBe(200);
      const csvText = res.text;
      const lines = csvText.trim().split('\n');

      // Header + Apex seed rows
      expect(lines[0]).toBe(
        'Reference Number,Title,Priority,Status,Site Name,Assigned Technician,Scheduled Start,Scheduled End,Created At'
      );
      expect(lines.length).toBeGreaterThan(1);
      expect(csvText).toContain('WO-APEX-');
      expect(csvText).not.toContain('WO-SUMMIT-');
      expect(csvText).not.toContain('Summit');
    });

    it('exports ONLY Summit work orders for Summit Dispatcher with ZERO Apex records', async () => {
      const res = await request(app)
        .get('/api/v1/work-orders/export/csv')
        .set('Authorization', `Bearer ${summitDispatcherToken}`);

      expect(res.status).toBe(200);
      const csvText = res.text;
      expect(csvText).toContain('WO-SUMMIT-');
      expect(csvText).not.toContain('WO-APEX-');
    });
  });

  describe('3. Spreadsheet Formula Injection (CSV Injection) Prevention', () => {
    it('escapes formula trigger payloads cleanly in unit helper', () => {
      expect(sanitizeCsvField('=1+1')).toBe("'=1+1");
      expect(sanitizeCsvField('+cmd|calc')).toBe("'+cmd|calc");
      expect(sanitizeCsvField('-cmd|calc')).toBe("'-cmd|calc");
      expect(sanitizeCsvField('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
      expect(sanitizeCsvField('\t=cmd')).toBe("'\t=cmd");
      expect(sanitizeCsvField('\r=cmd')).toBe("\"'\\r=cmd\"".replace('\\r', '\r'));
      expect(sanitizeCsvField('Normal, "Quoted" Value')).toBe('"Normal, ""Quoted"" Value"');
      expect(sanitizeCsvField(null)).toBe('');
    });

    it('sanitizes malicious formula titles in exported CSV endpoint', async () => {
      // Seed work orders containing formula injection payloads
      await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          title: '=HYPERLINK("http://attacker.com", "Malicious")',
          priority: 'urgent',
          siteName: '@SUM(1+1)',
        });

      await request(app)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          title: '+cmd|\' /C calc\'!A0',
          priority: 'high',
          siteName: '-MaliciousSite',
        });

      const res = await request(app)
        .get('/api/v1/work-orders/export/csv')
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(res.status).toBe(200);
      const csvText = res.text;

      // Verify formula payloads are neutralized with a leading single quote
      expect(csvText).toContain('"\'=HYPERLINK(""http://attacker.com"", ""Malicious"")"');
      expect(csvText).toContain("'@SUM(1+1)");
      expect(csvText).toContain("'+cmd|' /C calc'!A0");
      expect(csvText).toContain("'-MaliciousSite");
    });
  });

  describe('4. Filter Forwarding & Streaming Edge Cases', () => {
    it('applies status, priority, and search filters accurately', async () => {
      const res = await request(app)
        .get('/api/v1/work-orders/export/csv?status=in_progress&priority=urgent')
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(res.status).toBe(200);
      const lines = res.text.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2); // Header + at least 1 matching WO
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i]).toContain(',urgent,in_progress,');
      }
    });

    it('returns CSV header row when filter matches zero work orders', async () => {
      const res = await request(app)
        .get('/api/v1/work-orders/export/csv?search=NON_EXISTENT_QUERY_XYZ_999')
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(res.status).toBe(200);
      const lines = res.text.trim().split('\n');
      expect(lines.length).toBe(1);
      expect(lines[0]).toBe(
        'Reference Number,Title,Priority,Status,Site Name,Assigned Technician,Scheduled Start,Scheduled End,Created At'
      );
    });
  });
});

