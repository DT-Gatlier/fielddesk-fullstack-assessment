import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth/guards.js';
import type { Pool } from '../src/db/pool.js';
import { createOrg, createOwnerPool, createTestApp, login, TEST_PASSWORD, type TestOrg } from './helpers.js';

let app: FastifyInstance;
let ownerPool: Pool;
let org: TestOrg;

beforeAll(async () => {
  app = await createTestApp();
  ownerPool = createOwnerPool();
  org = await createOrg(ownerPool);
});

afterAll(async () => {
  await app.close();
  await ownerPool.end();
});

describe('login', () => {
  it('returns the user and sets an httpOnly, SameSite=Strict session cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: org.dispatcher.email.toUpperCase(), password: TEST_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user).toMatchObject({
      id: org.dispatcher.id,
      email: org.dispatcher.email,
      role: 'dispatcher',
      organisation: { id: org.id, name: org.name },
    });
    expect(JSON.stringify(body)).not.toContain('password');

    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('Strict');
  });

  it('stores only a SHA-256 hash of the session token', async () => {
    const cookie = await login(app, org.owner.email);
    const token = cookie.split('=')[1]!;
    const hashed = await ownerPool.query('SELECT 1 FROM sessions WHERE token_hash = sha256(convert_to($1, $2))', [token, 'UTF8']);
    const raw = await ownerPool.query('SELECT 1 FROM sessions WHERE token_hash = convert_to($1, $2)', [token, 'UTF8']);
    expect(hashed.rows).toHaveLength(1);
    expect(raw.rows).toHaveLength(0);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: org.owner.email, password: 'not-the-password' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@example.test', password: 'not-the-password' },
    });

    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.statusCode).toBe(401);
      expect(response.json().error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
      expect(response.cookies).toHaveLength(0);
    }
  });

  it('rejects deactivated users', async () => {
    const other = await createOrg(ownerPool);
    await ownerPool.query('UPDATE users SET is_active = false WHERE id = $1', [other.technician.id]);
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: other.technician.email, password: TEST_PASSWORD },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects client-supplied organisation or role fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: org.technician.email, password: TEST_PASSWORD, role: 'owner', orgId: org.id },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('validates the request body with field-level details', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'not-an-email' } });
    expect(response.statusCode).toBe(400);
    const paths = response.json().error.details.map((detail: { path: string }) => detail.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password']));
  });
});

describe('session', () => {
  it('requires a session for /api/auth/me', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a forged session token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${SESSION_COOKIE}=forged-token-value` },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects an expired session', async () => {
    const cookie = await login(app, org.technician.email);
    await ownerPool.query(
      `UPDATE sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 second'
       WHERE user_id = $1`,
      [org.technician.id],
    );
    const response = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(response.statusCode).toBe(401);
  });

  it('returns the current user for a valid session', async () => {
    const cookie = await login(app, org.dispatcher.email);
    const response = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ id: org.dispatcher.id, role: 'dispatcher' });
  });

  it('revokes the session on logout so the cookie cannot be reused', async () => {
    const cookie = await login(app, org.owner.email);
    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(logout.statusCode).toBe(204);

    const reuse = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(reuse.statusCode).toBe(401);
  });

  it('applies a role change on the next request without a new login', async () => {
    const other = await createOrg(ownerPool);
    const cookie = await login(app, other.dispatcher.email);
    await ownerPool.query(`UPDATE users SET role = 'technician' WHERE id = $1`, [other.dispatcher.id]);
    const response = await app.inject({ method: 'GET', url: '/api/users', headers: { cookie } });
    expect(response.statusCode).toBe(403);
  });
});

describe('cross-site requests', () => {
  it('rejects state-changing requests from a foreign Origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { email: org.owner.email, password: TEST_PASSWORD },
    });
    expect(response.statusCode).toBe(403);
  });
});
