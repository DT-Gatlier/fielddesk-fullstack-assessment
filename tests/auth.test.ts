import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SeedResult } from '../backend/src/db/seed-data';
import { createTestApp, loginAs, pool, resetData, type TestContext } from './helpers';

let ctx: TestContext;
let seed: SeedResult;

beforeAll(async () => {
  ctx = await createTestApp();
});
beforeEach(async () => {
  seed = await resetData(ctx.redis);
});
afterAll(() => ctx.close());

describe('authentication', () => {
  it('logs in with valid credentials and sets a hardened session cookie', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'dispatcher@acme.test', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: 'dispatcher@acme.test', role: 'dispatcher' });
    expect(res.body.data.organisation.name).toBe('Acme Facilities');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/fd_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it('accepts the email case-insensitively', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'Owner@ACME.test', password: 'Password123!' });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong password and an unknown email with the same response', async () => {
    const wrong = await request(ctx.app).post('/api/auth/login').send({ email: 'owner@acme.test', password: 'nope' });
    const unknown = await request(ctx.app).post('/api/auth/login').send({ email: 'nobody@acme.test', password: 'nope' });
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('validates the login payload', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('stores passwords as argon2id hashes, never in plain text', async () => {
    const { rows } = await pool.query("SELECT password_hash FROM users WHERE email = 'owner@acme.test'");
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(rows[0].password_hash).not.toContain('Password123!');
  });

  it('requires a session for API requests', async () => {
    const res = await request(ctx.app).get('/api/work-orders');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects forged or tampered session cookies', async () => {
    const res = await request(ctx.app).get('/api/auth/me').set('Cookie', 'fd_session=forged-token-value');
    expect(res.status).toBe(401);
  });

  it('logout invalidates the session server-side', async () => {
    const agent = await loginAs(ctx.app, 'dispatcher@acme.test');
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM sessions');
    expect(rows[0].n).toBe(0);
  });

  it('a stolen cookie stops working after logout (token is revoked, not just cleared)', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'owner@acme.test', password: 'Password123!' });
    const cookie = String(res.headers['set-cookie']).split(';')[0]!;
    await request(ctx.app).post('/api/auth/logout').set('Cookie', cookie);
    expect((await request(ctx.app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('deactivating a user ends their existing sessions immediately', async () => {
    const tech = await loginAs(ctx.app, 'tech2@acme.test');
    const owner = await loginAs(ctx.app, 'owner@acme.test');
    // tech2 has active work in the seed data; reassign it away first.
    await pool.query("UPDATE work_orders SET status = 'cancelled' WHERE technician_id = $1", [seed.acme!.users.tech2!.id]);
    const res = await owner.patch(`/api/users/${seed.acme!.users.tech2!.id}`).send({ isActive: false });
    expect(res.status).toBe(200);
    expect((await tech.get('/api/auth/me')).status).toBe(401);
    const relogin = await request(ctx.app).post('/api/auth/login').send({ email: 'tech2@acme.test', password: 'Password123!' });
    expect(relogin.status).toBe(401);
  });

  it('rate-limits repeated login attempts', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(ctx.app).post('/api/auth/login').send({ email: 'owner@acme.test', password: `wrong-${i}` });
      statuses.push(res.status);
    }
    // RATE_LIMIT_LOGIN_MAX=5 in the test environment.
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toEqual([429, 429]);
    const limited = await request(ctx.app).post('/api/auth/login').send({ email: 'owner@acme.test', password: 'Password123!' });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});
