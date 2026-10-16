import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lifecycle } from '../backend/src/app';
import { createTestApp, loginAs, resetData, type TestContext } from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
beforeEach(async () => {
  await resetData(ctx.redis);
});
afterAll(() => ctx.close());

describe('operational endpoints and API conventions', () => {
  it('liveness and readiness', async () => {
    expect((await request(ctx.app).get('/healthz')).body).toEqual({ status: 'ok' });
    const ready = await request(ctx.app).get('/readyz');
    expect(ready.status).toBe(200);
    expect(ready.body.checks).toMatchObject({ database: 'ok', redis: 'ok', migrations: 'ok' });
  });

  it('readiness fails while shutting down so the load balancer drains the instance', async () => {
    lifecycle.shuttingDown = true;
    try {
      const res = await request(ctx.app).get('/readyz');
      expect(res.status).toBe(503);
      expect(res.body.checks.lifecycle).toBe('shutting_down');
    } finally {
      lifecycle.shuttingDown = false;
    }
  });

  it('propagates a valid incoming correlation ID and generates one otherwise', async () => {
    const given = await request(ctx.app).get('/api/work-orders').set('X-Request-Id', 'trace-abc-123');
    expect(given.headers['x-request-id']).toBe('trace-abc-123');
    expect(given.body.error.requestId).toBe('trace-abc-123');
    const junk = await request(ctx.app).get('/api/work-orders').set('X-Request-Id', 'bad id <script>');
    expect(junk.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('stores the correlation ID on audit entries', async () => {
    const agent = await loginAs(ctx.app, 'dispatcher@acme.test');
    const res = await agent.post('/api/work-orders').set('X-Request-Id', 'req-for-audit').send({ title: 'T', priority: 'low', siteName: 'S' });
    const activity = await agent.get(`/api/work-orders/${res.body.data.id}/activity`);
    expect(activity.body.data[0].requestId).toBe('req-for-audit');
  });

  it('uses one error format everywhere', async () => {
    const agent = await loginAs(ctx.app, 'dispatcher@acme.test');
    const responses = await Promise.all([
      request(ctx.app).get('/api/nope'), // 401 (auth runs before routing)
      agent.get('/api/nope'), // 404 unknown route
      agent.post('/api/work-orders').set('content-type', 'application/json').send('{"broken json'),
      agent.post('/api/work-orders').send({}),
    ]);
    expect(responses.map((r) => r.status)).toEqual([401, 404, 400, 400]);
    expect(responses[2]!.body.error.code).toBe('INVALID_JSON');
    for (const r of responses) {
      expect(Object.keys(r.body)).toEqual(['error']);
      expect(r.body.error).toEqual(expect.objectContaining({ code: expect.any(String), message: expect.any(String), requestId: expect.any(String) }));
    }
  });

  it('rejects state-changing requests from untrusted browser origins', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'owner@acme.test', password: 'Password123!' });
    expect(res.status).toBe(403);
    const ok = await request(ctx.app)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ email: 'owner@acme.test', password: 'Password123!' });
    expect(ok.status).toBe(200);
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(ctx.app).get('/healthz');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
