import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '@/app.js';
import { config } from '@/infrastructure/config.js';
import { getRedisClient } from '@/infrastructure/redis.js';

const app = createApp();

describe('Feature 01: Authentication, RBAC & Multi-Tenant Isolation', () => {
  beforeEach(async () => {
    // Reset Redis state between test cases
    const redis = getRedisClient();
    await redis.flushall();
  });

  describe('1. Multi-Tenant Login & Seeded Accounts', () => {
    it('authenticates Apex Dispatcher with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'dispatcher@apex.test',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user).toMatchObject({
        id: '11111111-1111-1111-1111-111111111102',
        name: 'David Dispatcher (Apex)',
        email: 'dispatcher@apex.test',
        role: 'dispatcher',
        organisationId: 'org-apex-01',
      });
      expect(res.body.user.organisationName).toContain('Apex');
    });

    it('authenticates Summit Owner with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'owner@summit.test',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        id: '22222222-2222-2222-2222-222222222201',
        name: 'Sam Owner (Summit)',
        email: 'owner@summit.test',
        role: 'owner',
        organisationId: 'org-summit-02',
      });
    });

    it('authenticates Apex Technician with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'technician@apex.test',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('technician');
      expect(res.body.user.organisationId).toBe('org-apex-01');
    });

    it('rejects invalid password with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'dispatcher@apex.test',
          password: 'wrong_password',
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects nonexistent user email with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@unknown.test',
          password: 'password123',
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('2. JWT Access Token Invariants', () => {
    it('mints JWT with 15-minute TTL and claims (sub, orgId, role, jti)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'dispatcher@apex.test',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      const token = res.body.accessToken;
      const decoded = jwt.verify(token, config.JWT_SECRET) as any;

      expect(decoded.sub).toBe('11111111-1111-1111-1111-111111111102');
      expect(decoded.orgId).toBe('org-apex-01');
      expect(decoded.role).toBe('dispatcher');
      expect(decoded.jti).toBeDefined();
      expect(typeof decoded.jti).toBe('string');

      // 15 minutes TTL check (900 seconds)
      const lifetime = decoded.exp - decoded.iat;
      expect(lifetime).toBe(900);
    });
  });

  describe('3. Rate Limiting Protection (Brute Force)', () => {
    it('throttles after 5 failed login attempts per IP within 5 minutes', async () => {
      const testIp = 'test-rate-limit-ip';

      // 5 consecutive failed attempts
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .set('x-forwarded-for', testIp)
          .send({
            email: 'dispatcher@apex.test',
            password: 'bad-password',
          });
        expect(res.status).toBe(401);
      }

      // 6th attempt should be blocked with 429 Too Many Requests
      const blockedRes = await request(app)
        .post('/api/v1/auth/login')
        .set('x-forwarded-for', testIp)
        .send({
          email: 'dispatcher@apex.test',
          password: 'password123', // even with correct password!
        });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('4. Session Profile (/api/v1/auth/me)', () => {
    it('returns current user profile with valid Bearer token', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'dispatcher@apex.test',
          password: 'password123',
        });

      const token = loginRes.body.accessToken;

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user).toMatchObject({
        id: '11111111-1111-1111-1111-111111111102',
        email: 'dispatcher@apex.test',
        role: 'dispatcher',
        organisationId: 'org-apex-01',
      });
    });

    it('rejects request with missing token with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('rejects request with invalid signature token with 401 Unauthorized', async () => {
      const forgedToken = jwt.sign(
        { sub: 'hacker', orgId: 'org-apex-01', role: 'owner' },
        'wrong-secret'
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
    });
  });

  describe('5. Refresh Token Rotation', () => {
    it('rotates refresh token (burns old token, issues new token pair)', async () => {
      // 1. Initial Login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'dispatcher@apex.test',
          password: 'password123',
        });

      const oldRefreshToken = loginRes.body.refreshToken;

      // 2. Refresh tokens
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body).toHaveProperty('accessToken');
      expect(refreshRes.body).toHaveProperty('refreshToken');

      const newAccessToken = refreshRes.body.accessToken;
      const newRefreshToken = refreshRes.body.refreshToken;

      // 3. New access token works
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${newAccessToken}`);
      expect(meRes.status).toBe(200);

      // 4. Attempting to reuse old burned refresh token must be rejected!
      const reusedRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken });

      expect(reusedRes.status).toBe(401);
      expect(reusedRes.body.code).toBe('INVALID_REFRESH_TOKEN');

      // 5. But using the new refresh token works
      const secondRefreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: newRefreshToken });

      expect(secondRefreshRes.status).toBe(200);
    });
  });

  describe('6. Logout & Revocation Blocklist', () => {
    it('revokes access token on logout and blocks immediate reuse', async () => {
      // 1. Login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'dispatcher@apex.test',
          password: 'password123',
        });

      const token = loginRes.body.accessToken;

      // 2. Verify token is active
      const beforeLogout = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(beforeLogout.status).toBe(200);

      // 3. Logout
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);
      expect(logoutRes.status).toBe(204);

      // 4. Immediately try to use the revoked token -> Must return 401 with TOKEN_REVOKED
      const afterLogout = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(afterLogout.status).toBe(401);
      expect(afterLogout.body.code).toBe('TOKEN_REVOKED');
      expect(afterLogout.body.detail).toBe('Token has been revoked. Please log in again.');
    });
  });

  describe('7. Role-Based Access Control (RBAC)', () => {
    it('allows Dispatcher to access dispatcher/owner endpoint', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'dispatcher@apex.test',
          password: 'password123',
        });

      const token = loginRes.body.accessToken;

      const res = await request(app)
        .get('/api/v1/users/11111111-1111-1111-1111-111111111103')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Tom Technician (Apex)');
    });

    it('rejects Technician from accessing dispatcher/owner endpoint with 403 Forbidden RFC 7807', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'technician@apex.test',
          password: 'password123',
        });

      const token = loginRes.body.accessToken;

      const res = await request(app)
        .get('/api/v1/users/11111111-1111-1111-1111-111111111103')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
        title: 'Forbidden',
      });
      expect(res.body.detail).toContain('Access forbidden');
    });
  });

  describe('8. Zero-Trust Multi-Tenant Isolation & Anti-Enumeration', () => {
    it('returns 404 Not Found (never 403) when Apex user requests a Summit record', async () => {
      // Login as Apex Dispatcher
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'dispatcher@apex.test',
          password: 'password123',
        });

      const apexToken = loginRes.body.accessToken;

      // User ID 22222222-2222-2222-2222-222222222203 definitely exists, but belongs to Summit (org-summit-02)!
      const res = await request(app)
        .get('/api/v1/users/22222222-2222-2222-2222-222222222203')
        .set('Authorization', `Bearer ${apexToken}`);

      // Must return 404 to avoid leaking cross-tenant resource existence!
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });
});
