import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { UnrecoverableError } from 'bullmq';
import { createApp } from '@/app.js';
import { getRedisClient } from '@/infrastructure/redis.js';
import { resetMockWorkOrders, getMockAuditLogs, clearMockAuditLogs } from '@/infrastructure/db.js';
import { notificationQueue } from '@/queues/notification.queue.js';
import {
  processTechnicianNotificationJob,
  ProcessableNotificationJob,
} from '@/workers/technician-notification.worker.js';
import {
  MockNotificationProvider,
} from '@/workers/providers/mock-notification.provider.js';
import {
  TransientNotificationError,
} from '@/workers/types/notification.types.js';

const app = createApp();

let apexDispatcherToken: string;
let summitDispatcherToken: string;

describe('Feature 06: Background Worker & Mock Notifications Isolation', () => {
  beforeEach(async () => {
    const redis = getRedisClient();
    await redis.flushall();
    resetMockWorkOrders();
    notificationQueue.clear();
    clearMockAuditLogs();

    const apexDispRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dispatcher@apex.test', password: 'password123' });
    apexDispatcherToken = apexDispRes.body.accessToken;

    const summitDispRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dispatcher@summit.test', password: 'password123' });
    summitDispatcherToken = summitDispRes.body.accessToken;
  });

  describe('1. API Enqueueing & Deduplication Contract', () => {
    it('enqueues notification job with BullMQ deduplication key and backoff when technician is assigned', async () => {
      const workOrderId = '10000000-0000-0000-0000-000000000001';
      const technicianId = '11111111-1111-1111-1111-111111111103';

      const res = await request(app)
        .post(`/api/v1/work-orders/${workOrderId}/assign`)
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({
          technicianId,
          scheduledStart: '2026-11-25T10:00:00Z',
          scheduledEnd: '2026-11-25T12:00:00Z',
        });

      expect(res.status).toBe(200);

      const jobs = notificationQueue.getJobs();
      expect(jobs.length).toBeGreaterThanOrEqual(1);

      const latestJob = jobs[jobs.length - 1];
      expect(latestJob.name).toBe('send-technician-assignment');
      expect(latestJob.data.workOrderId).toBe(workOrderId);
      expect(latestJob.data.technicianId).toBe(technicianId);
      expect(latestJob.data.organisationId).toBe('org-apex-01');

      // Verify BullMQ job options & deduplication key format
      expect(latestJob.opts?.jobId).toBe(`notify:org-apex-01:${workOrderId}:${technicianId}`);
      expect(latestJob.opts?.attempts).toBe(5);
      expect(latestJob.opts?.backoff).toEqual({ type: 'exponential', delay: 2000 });
    });
  });

  describe('2. Controllable Mock Notification Provider', () => {
    const provider = new MockNotificationProvider();

    it('simulates 200 OK delivery in always_success mode', async () => {
      const result = await provider.sendAssignmentNotification({
        workOrderId: '10000000-0000-0000-0000-000000000001',
        technicianId: '11111111-1111-1111-1111-111111111103',
        organisationId: 'org-apex-01',
        simulationMode: 'always_success',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('MockNotificationProvider');
      expect(result.deliveredAt).toBeInstanceOf(Date);
      expect(result.messageId).toMatch(/^msg_/);
    });

    it('simulates 503 / 429 gateway error throwing TransientNotificationError in temporary_failure mode', async () => {
      await expect(
        provider.sendAssignmentNotification({
          workOrderId: '10000000-0000-0000-0000-000000000001',
          technicianId: '11111111-1111-1111-1111-111111111103',
          organisationId: 'org-apex-01',
          simulationMode: 'temporary_failure',
        })
      ).rejects.toThrow('MOCK_503_SERVICE_UNAVAILABLE');
    });

    it('simulates 400 Bad Request throwing UnrecoverableError in permanent_failure mode', async () => {
      await expect(
        provider.sendAssignmentNotification({
          workOrderId: '10000000-0000-0000-0000-000000000001',
          technicianId: '11111111-1111-1111-1111-111111111103',
          organisationId: 'org-apex-01',
          simulationMode: 'permanent_failure',
        })
      ).rejects.toThrow(UnrecoverableError);
    });
  });

  describe('3. Worker Consumer & Audit Logging Engine', () => {
    it('records NOTIFICATION_DELIVERED audit log with diagnostic metadata on success', async () => {
      const job: ProcessableNotificationJob = {
        id: 'job_test_success_1',
        data: {
          workOrderId: '10000000-0000-0000-0000-000000000001',
          technicianId: '11111111-1111-1111-1111-111111111103',
          organisationId: 'org-apex-01',
          simulationMode: 'always_success',
        },
        attemptsMade: 0,
      };

      const result = await processTechnicianNotificationJob(job);
      expect(result.success).toBe(true);

      const auditLogs = getMockAuditLogs();
      expect(auditLogs.length).toBe(1);

      const deliveredLog = auditLogs[0];
      expect(deliveredLog.action).toBe('NOTIFICATION_DELIVERED');
      expect(deliveredLog.target_type).toBe('work_order');
      expect(deliveredLog.target_id).toBe('10000000-0000-0000-0000-000000000001');
      expect(deliveredLog.organisation_id).toBe('org-apex-01');
      expect(deliveredLog.actor_id).toBeNull();
      expect(deliveredLog.metadata).toMatchObject({
        technicianId: '11111111-1111-1111-1111-111111111103',
        provider: 'MockNotificationProvider',
        attempt: 1,
      });
      expect(deliveredLog.metadata.deliveredAt).toBeDefined();
    });

    it('records NOTIFICATION_ATTEMPT_FAILED and re-throws for BullMQ backoff retry on temporary failure', async () => {
      const job: ProcessableNotificationJob = {
        id: 'job_test_retry_1',
        data: {
          workOrderId: '10000000-0000-0000-0000-000000000001',
          technicianId: '11111111-1111-1111-1111-111111111103',
          organisationId: 'org-apex-01',
          simulationMode: 'temporary_failure',
        },
        attemptsMade: 1, // Second attempt
      };

      await expect(processTechnicianNotificationJob(job)).rejects.toThrow(TransientNotificationError);

      const auditLogs = getMockAuditLogs();
      expect(auditLogs.length).toBe(1);

      const retryLog = auditLogs[0];
      expect(retryLog.action).toBe('NOTIFICATION_ATTEMPT_FAILED');
      expect(retryLog.target_id).toBe('10000000-0000-0000-0000-000000000001');
      expect(retryLog.metadata).toMatchObject({
        technicianId: '11111111-1111-1111-1111-111111111103',
        provider: 'MockNotificationProvider',
        attempt: 2,
        error: 'MOCK_503_SERVICE_UNAVAILABLE',
      });
      // Verifies exponential backoff delay calculation in metadata
      expect(retryLog.metadata.nextRetryDelay).toBe(4000); // 2^2 * 1000
    });

    it('terminates immediately and records NOTIFICATION_PERMANENTLY_FAILED on unrecoverable failure', async () => {
      const job: ProcessableNotificationJob = {
        id: 'job_test_fatal_1',
        data: {
          workOrderId: '10000000-0000-0000-0000-000000000001',
          technicianId: '11111111-1111-1111-1111-111111111103',
          organisationId: 'org-apex-01',
          simulationMode: 'permanent_failure',
        },
        attemptsMade: 0, // First attempt fails permanently
      };

      await expect(processTechnicianNotificationJob(job)).rejects.toThrow(UnrecoverableError);

      const auditLogs = getMockAuditLogs();
      expect(auditLogs.length).toBe(1);

      const fatalLog = auditLogs[0];
      expect(fatalLog.action).toBe('NOTIFICATION_PERMANENTLY_FAILED');
      expect(fatalLog.target_id).toBe('10000000-0000-0000-0000-000000000001');
      expect(fatalLog.metadata).toMatchObject({
        technicianId: '11111111-1111-1111-1111-111111111103',
        attempt: 1,
        error: 'MOCK_400_INVALID_PHONE_FORMAT',
        fatal: true,
      });
    });

    it('tracks sequential retry progression leading up to final success', async () => {
      const workOrderId = '10000000-0000-0000-0000-000000000001';
      const technicianId = '11111111-1111-1111-1111-111111111103';

      // Attempt 1 fails
      const job1: ProcessableNotificationJob = {
        id: 'job_prog_1',
        data: { workOrderId, technicianId, organisationId: 'org-apex-01', simulationMode: 'temporary_failure' },
        attemptsMade: 0,
      };
      await expect(processTechnicianNotificationJob(job1)).rejects.toThrow();

      // Attempt 2 fails
      const job2: ProcessableNotificationJob = {
        id: 'job_prog_1',
        data: { workOrderId, technicianId, organisationId: 'org-apex-01', simulationMode: 'temporary_failure' },
        attemptsMade: 1,
      };
      await expect(processTechnicianNotificationJob(job2)).rejects.toThrow();

      // Attempt 3 succeeds
      const job3: ProcessableNotificationJob = {
        id: 'job_prog_1',
        data: { workOrderId, technicianId, organisationId: 'org-apex-01', simulationMode: 'always_success' },
        attemptsMade: 2,
      };
      await processTechnicianNotificationJob(job3);

      const auditLogs = getMockAuditLogs();
      expect(auditLogs.length).toBe(3);

      expect(auditLogs[0].action).toBe('NOTIFICATION_ATTEMPT_FAILED');
      expect(auditLogs[0].metadata.attempt).toBe(1);

      expect(auditLogs[1].action).toBe('NOTIFICATION_ATTEMPT_FAILED');
      expect(auditLogs[1].metadata.attempt).toBe(2);

      expect(auditLogs[2].action).toBe('NOTIFICATION_DELIVERED');
      expect(auditLogs[2].metadata.attempt).toBe(3);
    });
  });
});

