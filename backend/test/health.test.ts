import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

it('reports liveness and readiness', async () => {
  expect((await app.inject({ method: 'GET', url: '/health/live' })).statusCode).toBe(200);

  const ready = await app.inject({ method: 'GET', url: '/health/ready' });
  expect(ready.statusCode).toBe(200);
  expect(ready.json()).toMatchObject({ status: 'ready', checks: { database: 'ok', redis: 'ok' } });
});

it('reports not ready while shutting down', async () => {
  app.shuttingDown = true;
  try {
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(503);
  } finally {
    app.shuttingDown = false;
  }
});

it('echoes a valid X-Request-Id and generates one otherwise', async () => {
  const echoed = await app.inject({ method: 'GET', url: '/health/live', headers: { 'x-request-id': 'abc-123' } });
  expect(echoed.headers['x-request-id']).toBe('abc-123');

  const replaced = await app.inject({
    method: 'GET',
    url: '/health/live',
    headers: { 'x-request-id': 'bad id with spaces\n' },
  });
  expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
});

it('uses the standard error format for unknown routes', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/does-not-exist', headers: { 'x-request-id': 'nf-1' } });
  expect(response.statusCode).toBe(404);
  expect(response.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found.', requestId: 'nf-1' } });
});
