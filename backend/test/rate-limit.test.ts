import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp({ env: { LOGIN_RATE_LIMIT_MAX: '3', LOGIN_RATE_LIMIT_WINDOW: '1 minute' } });
});

afterAll(async () => {
  await app.close();
});

it('rate-limits login attempts and returns the standard error format', async () => {
  const attempt = () =>
    app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'x@example.test', password: 'wrong' } });

  for (let i = 0; i < 3; i += 1) {
    expect((await attempt()).statusCode).toBe(401);
  }
  const limited = await attempt();
  expect(limited.statusCode).toBe(429);
  expect(limited.json().error).toMatchObject({ code: 'RATE_LIMITED', requestId: expect.any(String) });
  expect(limited.headers['retry-after']).toBeDefined();
});
