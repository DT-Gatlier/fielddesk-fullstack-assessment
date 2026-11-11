import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Writable } from 'stream';
import request from 'supertest';
import { createApp } from '@/app.js';
import { getDbPool, resetMockWorkOrders } from '@/infrastructure/db.js';
import { getRedisClient } from '@/infrastructure/redis.js';
import { createAppLogger, runWithLogContext } from '@/infrastructure/logger.js';
import { notificationQueue } from '@/queues/notification.queue.js';

const app = createApp();

describe('Feature 10: Operational Quality, Probes, Tracing, Redaction & Rate Limiting', () => {
  beforeEach(async () => {
    const redis = getRedisClient();
    await redis.flushall();
    resetMockWorkOrders();
    notificationQueue.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Liveness (/healthz) & Readiness (/readyz) Probes', () => {
    it('GET /healthz returns 200 healthy with timestamp', async () => {
      const res = await request(app).get('/healthz');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(typeof res.body.timestamp).toBe('string');
      expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
    });

    it('GET /readyz returns 200 ready when both PostgreSQL and Redis respond', async () => {
      const pool = getDbPool();
      vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ '?column?': 1 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const res = await request(app).get('/readyz');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ready',
        checks: {
          postgres: 'connected',
          redis: 'connected',
        },
      });
      expect(typeof res.body.uptimeSeconds).toBe('number');
    });

    it('GET /readyz returns 503 unready when PostgreSQL connectivity fails', async () => {
      const pool = getDbPool();
      vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('timeout'));

      const res = await request(app).get('/readyz');

      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({
        status: 'unready',
        checks: {
          postgres: 'connection_error: timeout',
          redis: 'connected',
        },
      });
    });

    it('GET /readyz returns 503 unready when Redis connectivity fails', async () => {
      const pool = getDbPool();
      vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ '?column?': 1 }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as any);

      const redis = getRedisClient();
      vi.spyOn(redis, 'ping').mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await request(app).get('/readyz');

      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({
        status: 'unready',
        checks: {
          postgres: 'connected',
          redis: 'connection_error: ECONNREFUSED',
        },
      });
    });
  });

  describe('2. Correlation IDs & Worker Job Propagation', () => {
    it('forwards incoming X-Correlation-ID header to response and RFC 7807 errors', async () => {
      const customId = 'custom-trace-id-123';
      const healthRes = await request(app)
        .get('/healthz')
        .set('X-Correlation-ID', customId);

      expect(healthRes.status).toBe(200);
      expect(healthRes.headers['x-correlation-id']).toBe(customId);

      const errRes = await request(app)
        .get('/api/v1/work-orders')
        .set('X-Correlation-ID', customId);

      expect(errRes.status).toBe(401);
      expect(errRes.headers['x-correlation-id']).toBe(customId);
      expect(errRes.body.correlationId).toBe(customId);
    });

    it('generates a valid UUID v4 X-Correlation-ID when header is omitted', async () => {
      const res = await request(app).get('/healthz');
      const headerId = res.headers['x-correlation-id'];

      expect(headerId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('attaches request X-Correlation-ID to downstream BullMQ notification jobs', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'dispatcher@apex.test', password: 'password123' });
      const token = loginRes.body.accessToken;

      const traceId = 'trace-dispatch-999';
      const assignRes = await request(app)
        .post('/api/v1/work-orders/10000000-0000-0000-0000-000000000001/assign')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Correlation-ID', traceId)
        .send({
          technicianId: '11111111-1111-1111-1111-111111111104',
          scheduledStart: '2026-12-15T09:00:00Z',
          scheduledEnd: '2026-12-15T11:00:00Z',
        });

      expect(assignRes.status).toBe(200);
      const jobs = notificationQueue.getJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].data.correlationId).toBe(traceId);
    });
  });

  describe('3. Structured Pino JSON Logging & Sensitive Field Redaction', () => {
    it('outputs JSON logs with context fields and redacts credentials and tokens', () => {
      const chunks: string[] = [];
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(chunk.toString());
          callback();
        },
      });

      const testLogger = createAppLogger({ level: 'info', destination: stream });

      runWithLogContext(
        {
          correlationId: 'log-trace-abc',
          organisationId: 'org-apex-01',
          userId: 'user-123',
        },
        () => {
          testLogger.info(
            {
              password: 'super-secret-password',
              token: 'jwt-raw-token',
              refreshToken: 'ref_secret_value',
              authorization: 'Bearer top-secret',
              nested: { password: 'nested-password' },
              method: 'POST',
              route: '/api/v1/auth/login',
              durationMs: 12.4,
            },
            'Audit log check'
          );
        }
      );

      expect(chunks).toHaveLength(1);
      const record = JSON.parse(chunks[0]);

      expect(record.level).toBe('info');
      expect(record.time).toBeDefined();
      expect(record.correlationId).toBe('log-trace-abc');
      expect(record.organisationId).toBe('org-apex-01');
      expect(record.userId).toBe('user-123');
      expect(record.method).toBe('POST');
      expect(record.route).toBe('/api/v1/auth/login');
      expect(record.durationMs).toBe(12.4);

      expect(record.password).toBe('[REDACTED]');
      expect(record.token).toBe('[REDACTED]');
      expect(record.refreshToken).toBe('[REDACTED]');
      expect(record.authorization).toBe('[REDACTED]');
      expect(record.nested.password).toBe('[REDACTED]');

      expect(chunks[0]).not.toContain('super-secret-password');
      expect(chunks[0]).not.toContain('jwt-raw-token');
      expect(chunks[0]).not.toContain('ref_secret_value');
      expect(chunks[0]).not.toContain('Bearer top-secret');
      expect(chunks[0]).not.toContain('nested-password');
    });
  });

  describe('4. Redis Sliding Window Rate Limiting & Retry-After Headers', () => {
    it('returns Retry-After header when login brute-force rate limit triggers (429)', async () => {
      const testIp = 'ops-login-throttle-ip';

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .set('x-forwarded-for', testIp)
          .send({ email: 'dispatcher@apex.test', password: 'wrong' });
      }

      const blockedRes = await request(app)
        .post('/api/v1/auth/login')
        .set('x-forwarded-for', testIp)
        .send({ email: 'dispatcher@apex.test', password: 'password123' });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(Number(blockedRes.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('enforces 60 progress events per minute per technician and returns 429 with Retry-After', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'technician@apex.test', password: 'password123' });
      const techToken = loginRes.body.accessToken;

      const woId = '10000000-0000-0000-0000-000000000001';

      // Submit 60 valid requests (within quota)
      for (let i = 1; i <= 60; i++) {
        const res = await request(app)
          .post(`/api/v1/work-orders/${woId}/events`)
          .set('Authorization', `Bearer ${techToken}`)
          .send({
            eventId: `evt-rate-${i}`,
            workOrderId: woId,
            type: 'note_added',
            occurredAt: new Date().toISOString(),
            payload: { note: `Update #${i}` },
          });
        expect(res.status).toBe(200);
        expect(res.headers['x-ratelimit-limit']).toBe('60');
      }

      // 61st request within the 1-minute sliding window must be throttled with 429 + Retry-After
      const throttledRes = await request(app)
        .post(`/api/v1/work-orders/${woId}/events`)
        .set('Authorization', `Bearer ${techToken}`)
        .send({
          eventId: 'evt-rate-61',
          workOrderId: woId,
          type: 'note_added',
          occurredAt: new Date().toISOString(),
          payload: { note: 'Update #61 should be rejected' },
        });

      expect(throttledRes.status).toBe(429);
      expect(throttledRes.body.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(Number(throttledRes.headers['retry-after'])).toBeGreaterThan(0);
      expect(throttledRes.headers['x-ratelimit-remaining']).toBe('0');
    });
  });
});

