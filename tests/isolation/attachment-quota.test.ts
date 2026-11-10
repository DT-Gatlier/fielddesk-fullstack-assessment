import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '@/app.js';
import { getRedisClient } from '@/infrastructure/redis.js';
import {
  resetMockWorkOrders,
  resetMockAttachments,
  setMockOrgQuota,
  getMockAuditLogs,
} from '@/infrastructure/db.js';

const app = createApp();

let apexDispatcherToken: string;
let apexOwnerToken: string;
let apexTech1Token: string;
let apexTech2Token: string;
let summitDispatcherToken: string;

const APEX_WO_1 = '10000000-0000-0000-0000-000000000001'; // assigned to Tech 1
const APEX_WO_3 = '10000000-0000-0000-0000-000000000003'; // assigned to Tech 2
const SUMMIT_WO_1 = '20000000-0000-0000-0000-000000000001';

// Magic byte sample buffers
const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const PDF_BUFFER = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n>>\nendobj\ntrailer\n<<\n>>\n%%EOF');
const FAKE_SHELL_BUFFER = Buffer.from('#!/bin/bash\necho "exploit"\n');
const EXE_BUFFER = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

describe('Feature 05: Attachments & Storage Quotas Isolation', () => {
  beforeEach(async () => {
    const redis = getRedisClient();
    await redis.flushall();
    resetMockWorkOrders();
    resetMockAttachments();
    setMockOrgQuota('org-apex-01', 524288000); // 500 MB default
    setMockOrgQuota('org-summit-02', 524288000);

    // Authenticate test personas
    const dispRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dispatcher@apex.test', password: 'password123' });
    apexDispatcherToken = dispRes.body.accessToken;

    const ownerRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@apex.test', password: 'password123' });
    apexOwnerToken = ownerRes.body.accessToken;

    const tech1Res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'technician@apex.test', password: 'password123' });
    apexTech1Token = tech1Res.body.accessToken;

    const tech2Res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'technician2@apex.test', password: 'password123' });
    apexTech2Token = tech2Res.body.accessToken;

    const sumDispRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dispatcher@summit.test', password: 'password123' });
    summitDispatcherToken = sumDispRes.body.accessToken;
  });

  describe('1. Magic Byte Inspection & File Type Validation', () => {
    it('accepts valid JPEG file based on magic bytes (FF D8 FF)', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/attachments`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .attach('file', JPEG_BUFFER, 'compressor_leak.jpg');

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.workOrderId).toBe(APEX_WO_1);
      expect(res.body.originalFilename).toBe('compressor_leak.jpg');
      expect(res.body.mimeType).toBe('image/jpeg');
      expect(res.body.fileSizeBytes).toBe(JPEG_BUFFER.length);
      expect(res.body.downloadUrl).toBe(`/api/v1/attachments/${res.body.id}/download`);
    });

    it('accepts valid PNG file based on magic bytes (89 50 4E 47)', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/attachments`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .attach('file', PNG_BUFFER, 'diagram.png');

      expect(res.status).toBe(201);
      expect(res.body.mimeType).toBe('image/png');
      expect(res.body.fileSizeBytes).toBe(PNG_BUFFER.length);
    });

    it('accepts valid PDF file based on magic bytes (%PDF)', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/attachments`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .attach('file', PDF_BUFFER, 'inspection_report.pdf');

      expect(res.status).toBe(201);
      expect(res.body.mimeType).toBe('application/pdf');
      expect(res.body.fileSizeBytes).toBe(PDF_BUFFER.length);
    });

    it('rejects spoofed extension (fake JPEG containing bash script) with 400 Bad Request', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/attachments`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .attach('file', FAKE_SHELL_BUFFER, 'spoofed_photo.jpg');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_FILE_TYPE');
      expect(res.body.detail).toMatch(/Unsupported file type/i);
    });

    it('rejects executable binary (MZ header) with 400 Bad Request', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/attachments`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .attach('file', EXE_BUFFER, 'malicious.exe');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_FILE_TYPE');
    });

    it('sanitizes filename to prevent directory traversal and strips path prefixes', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/attachments`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .attach('file', JPEG_BUFFER, '../../../etc/passwd.jpg');

      expect(res.status).toBe(201);
      expect(res.body.originalFilename).not.toContain('..');
      expect(res.body.originalFilename).not.toContain('/');
      expect(res.body.originalFilename).toContain('passwd.jpg');
    });
  });

  describe('2. Organisation Storage Quota Enforcement', () => {
    it('returns organisation storage quota usage metrics', async () => {
      // 1. Upload an attachment
      await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/attachments`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .attach('file', JPEG_BUFFER, 'photo1.jpg');

      // 2. Fetch quota info
      const res = await request(app)
        .get('/api/v1/organisations/quota')
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('usedBytes');
      expect(res.body).toHaveProperty('quotaBytes');
      expect(res.body).toHaveProperty('percentUsed');
      expect(res.body.usedBytes).toBe(JPEG_BUFFER.length);
      expect(res.body.quotaBytes).toBe(524288000);
    });

    it('rejects upload with 422 Unprocessable Entity when organisation quota is exceeded', async () => {
      // Set quota limit to 5 bytes
      setMockOrgQuota('org-apex-01', 5);

      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/attachments`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .attach('file', JPEG_BUFFER, 'too_large_for_quota.jpg');

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('QUOTA_EXCEEDED');
      expect(res.body.detail).toMatch(/quota.*exceeded/i);
    });
  });

  describe('3. Secure Download & Multi-Tenant Anti-Enumeration Isolation', () => {
    it('allows downloading attachment within same organisation with correct Content-Type', async () => {
      // 1. Upload valid image
      const uploadRes = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/attachments`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .attach('file', JPEG_BUFFER, 'hvac_unit.jpg');

      const attachmentId = uploadRes.body.id;

      // 2. Download as Apex Dispatcher
      const downloadRes = await request(app)
        .get(`/api/v1/attachments/${attachmentId}/download`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`);

      expect(downloadRes.status).toBe(200);
      expect(downloadRes.headers['content-type']).toBe('image/jpeg');
      expect(downloadRes.headers['content-disposition']).toMatch(/attachment; filename=/);
      expect(downloadRes.body).toEqual(JPEG_BUFFER);
    });

    it('returns 404 Not Found (anti-enumeration) when user from another organisation attempts download', async () => {
      // 1. Upload attachment in Apex
      const uploadRes = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/attachments`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .attach('file', JPEG_BUFFER, 'confidential_blueprint.jpg');

      const attachmentId = uploadRes.body.id;

      // 2. Attempt download using Summit token
      const downloadRes = await request(app)
        .get(`/api/v1/attachments/${attachmentId}/download`)
        .set('Authorization', `Bearer ${summitDispatcherToken}`);

      // Must be 404 Not Found to prevent leaking existence of Apex attachment
      expect(downloadRes.status).toBe(404);
      expect(downloadRes.status).not.toBe(403);
    });

    it('returns 404 Not Found when attempting to upload attachment to another organisation work order', async () => {
      // Summit user attempts to upload to Apex work order
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/attachments`)
        .set('Authorization', `Bearer ${summitDispatcherToken}`)
        .attach('file', JPEG_BUFFER, 'cross_tenant.jpg');

      expect(res.status).toBe(404);
    });
  });

  describe('4. Technician Scoping & Authorization', () => {
    it('allows assigned technician to upload attachment to their work order', async () => {
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/attachments`)
        .set('Authorization', `Bearer ${apexTech1Token}`)
        .attach('file', PNG_BUFFER, 'tech1_progress.png');

      expect(res.status).toBe(201);
      expect(res.body.originalFilename).toBe('tech1_progress.png');
    });

    it('rejects technician from uploading attachment to an unassigned work order with 403 Forbidden', async () => {
      // Tech 1 is not assigned to WO 3 (Tech 2 is assigned)
      const res = await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_3}/attachments`)
        .set('Authorization', `Bearer ${apexTech1Token}`)
        .attach('file', PNG_BUFFER, 'unauthorized.png');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('records an immutable audit log entry for attachment upload', async () => {
      await request(app)
        .post(`/api/v1/work-orders/${APEX_WO_1}/attachments`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .attach('file', PDF_BUFFER, 'compliance_cert.pdf');

      const logs = getMockAuditLogs();
      const uploadLog = logs.find((l) => l.action === 'ATTACHMENT_UPLOADED');
      expect(uploadLog).toBeDefined();
      expect(uploadLog?.target_id).toBe(APEX_WO_1);
      expect(uploadLog?.organisation_id).toBe('org-apex-01');
    });
  });
});

