import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { createApp } from '@/app.js';
import { getRedisClient } from '@/infrastructure/redis.js';
import { resetMockWorkOrders } from '@/infrastructure/db.js';
import { sseManager } from '@/realtime/sse-manager.js';

const app = createApp();

let server: http.Server;
let port: number;
let apexDispatcherToken: string;
let summitDispatcherToken: string;

describe('Feature 07: Real-Time Updates via SSE Isolation', () => {
  beforeEach(async () => {
    // Start listening on dynamic port for SSE streams
    server = app.listen(0);
    port = (server.address() as AddressInfo).port;

    const redis = getRedisClient();
    await redis.flushall();
    resetMockWorkOrders();
    sseManager.clear();

    // Authenticate Apex Dispatcher
    const apexDispRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dispatcher@apex.test', password: 'password123' });
    apexDispatcherToken = apexDispRes.body.accessToken;

    // Authenticate Summit Dispatcher
    const summitDispRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dispatcher@summit.test', password: 'password123' });
    summitDispatcherToken = summitDispRes.body.accessToken;
  });

  afterEach(async () => {
    sseManager.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterAll(() => {
    sseManager.destroy();
  });

  describe('1. Authentication & Security Guard', () => {
    it('rejects connection without token with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/realtime/stream');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('rejects connection with invalid token with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/realtime/stream?token=invalid_token_payload');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });
  });

  describe('2. Connection Handshake & Welcome Event', () => {
    it('establishes SSE connection with correct headers and emits connected event', async () => {
      let received = '';
      let headers: http.IncomingHttpHeaders | null = null;

      const streamPromise = new Promise<void>((resolve) => {
        const req = http.get(
          `http://127.0.0.1:${port}/api/v1/realtime/stream?token=${apexDispatcherToken}`,
          (res) => {
            headers = res.headers;
            res.on('data', (chunk) => {
              received += chunk.toString();
              if (received.includes('event: connected')) {
                req.destroy();
                resolve();
              }
            });
          }
        );
      });

      await streamPromise;

      expect(headers).toBeDefined();
      expect(headers!['content-type']).toBe('text/event-stream');
      expect(headers!['cache-control']).toBe('no-cache, no-transform');
      expect(headers!['connection']).toBe('keep-alive');
      expect(received).toContain('event: connected');
      expect(received).toContain('"organisationId":"org-apex-01"');
    });
  });

  describe('3. Multi-Tenant Organisation Channel Isolation', () => {
    it('delivers real-time updates to Apex client while Summit client receives ZERO events', async () => {
      let apexReceived = '';
      let summitReceived = '';

      let apexConnected = false;
      let summitConnected = false;

      // 1. Open Apex SSE client
      const apexReq = http.get(
        `http://127.0.0.1:${port}/api/v1/realtime/stream?token=${apexDispatcherToken}`,
        (res) => {
          res.on('data', (chunk) => {
            const text = chunk.toString();
            apexReceived += text;
            if (text.includes('event: connected')) {
              apexConnected = true;
            }
          });
        }
      );

      // 2. Open Summit SSE client
      const summitReq = http.get(
        `http://127.0.0.1:${port}/api/v1/realtime/stream?token=${summitDispatcherToken}`,
        (res) => {
          res.on('data', (chunk) => {
            const text = chunk.toString();
            summitReceived += text;
            if (text.includes('event: connected')) {
              summitConnected = true;
            }
          });
        }
      );

      // Wait for both connections to establish
      for (let i = 0; i < 20; i++) {
        if (apexConnected && summitConnected) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(apexConnected).toBe(true);
      expect(summitConnected).toBe(true);

      // Clear connection welcome messages from buffer before update
      apexReceived = '';
      summitReceived = '';

      // 3. Trigger work order update in Apex organisation
      const updateRes = await request(app)
        .patch('/api/v1/work-orders/10000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${apexDispatcherToken}`)
        .send({ title: 'Live Realtime Updated Title' });

      expect(updateRes.status).toBe(200);

      // Wait up to 500ms for event propagation
      for (let i = 0; i < 10; i++) {
        if (apexReceived.includes('work_order_updated')) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      // Cleanup sockets
      apexReq.destroy();
      summitReq.destroy();

      // Assert Apex received WORK_ORDER_UPDATED
      expect(apexReceived).toContain('event: work_order_updated');
      expect(apexReceived).toContain('WORK_ORDER_UPDATED');
      expect(apexReceived).toContain('10000000-0000-0000-0000-000000000001');

      // Assert Summit received ZERO events (multi-tenant boundary respected)
      expect(summitReceived).not.toContain('work_order_updated');
      expect(summitReceived).not.toContain('10000000-0000-0000-0000-000000000001');
      expect(summitReceived).toBe('');
    });
  });

  describe('4. Heartbeat Ping & Socket Lifecycle', () => {
    it('emits comment ping (: ping) to active connections', async () => {
      let received = '';

      const streamPromise = new Promise<void>((resolve) => {
        const req = http.get(
          `http://127.0.0.1:${port}/api/v1/realtime/stream?token=${apexDispatcherToken}`,
          (res) => {
            res.on('data', (chunk) => {
              received += chunk.toString();
              if (received.includes(': ping')) {
                req.destroy();
                resolve();
              }
            });
          }
        );
      });

      // Wait a moment for connection registration, then trigger ping
      await new Promise((r) => setTimeout(r, 100));
      sseManager.sendPingToAll();

      await streamPromise;

      expect(received).toContain(': ping\n\n');
    });

    it('cleans up client socket from pool when disconnected', async () => {
      let clientConnected = false;

      const req = http.get(
        `http://127.0.0.1:${port}/api/v1/realtime/stream?token=${apexDispatcherToken}`,
        (res) => {
          res.on('data', (chunk) => {
            if (chunk.toString().includes('event: connected')) {
              clientConnected = true;
            }
          });
        }
      );

      // Wait for connection
      for (let i = 0; i < 20; i++) {
        if (clientConnected) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(sseManager.getClientCount('org-apex-01')).toBe(1);

      // Disconnect client socket
      req.destroy();

      // Wait for close event cleanup
      for (let i = 0; i < 20; i++) {
        if (sseManager.getClientCount('org-apex-01') === 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(sseManager.getClientCount('org-apex-01')).toBe(0);
    });
  });
});

