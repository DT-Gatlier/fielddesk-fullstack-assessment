import argon2 from 'argon2';
import { Router } from 'express';
import { z } from 'zod';
import { writeAudit } from '../../../../shared/audit';
import { config } from '../../../../shared/config';
import { pool } from '../../../../shared/db';
import type { AppDeps } from '../../deps';
import { AppError } from '../../lib/errors';
import { PERMISSIONS, can, type Permission } from '../../lib/permissions';
import { createSession, destroySession, hashToken, SESSION_COOKIE, sessionCookieOptions } from '../../lib/session';
import { authenticate, authOf } from '../../middleware/auth';
import { loginLimiter } from '../../middleware/rate-limit';
import { parseBody } from '../../middleware/validate';
import type { Role } from '../../types';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

// Verifying against a dummy hash when the email is unknown keeps response
// time similar for unknown and known emails (no account enumeration by timing).
const dummyHash = argon2.hash('fielddesk-dummy-password', { type: argon2.argon2id });

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

export function authRouter(deps: AppDeps): Router {
  const router = Router();

  router.post(
    '/login',
    loginLimiter(deps.redis, config.RATE_LIMIT_LOGIN_MAX, config.RATE_LIMIT_LOGIN_WINDOW_SEC),
    async (req, res) => {
      const { email, password } = parseBody(req, loginSchema);
      const { rows } = await pool.query<{ id: string; org_id: string; password_hash: string; is_active: boolean }>(
        'SELECT id, org_id, password_hash, is_active FROM users WHERE lower(email) = $1',
        [email],
      );
      const user = rows[0];
      const ok = await argon2.verify(user?.password_hash ?? (await dummyHash), password).catch(() => false);
      if (!user || !ok || !user.is_active) {
        req.log.info({ email }, 'login failed');
        throw invalidCredentials();
      }
      const token = await createSession(pool, user.id, { userAgent: req.headers['user-agent'], ip: req.ip });
      await writeAudit(pool, {
        orgId: user.org_id, actorType: 'user', actorId: user.id, action: 'auth.login',
        targetType: 'user', targetId: user.id, requestId: String(req.id),
      });
      res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
      req.log.info({ userId: user.id }, 'login succeeded');
      res.json({ data: await loadMe(user.id) });
    },
  );

  // Logout works even with an expired session: it always clears the cookie.
  router.post('/logout', async (req, res) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 0 && token.length <= 200) {
      const tokenHash = hashToken(token);
      const { rows } = await pool.query<{ user_id: string; org_id: string }>(
        'SELECT s.user_id, u.org_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1',
        [tokenHash],
      );
      await destroySession(pool, tokenHash);
      if (rows[0]) {
        await writeAudit(pool, {
          orgId: rows[0].org_id, actorType: 'user', actorId: rows[0].user_id, action: 'auth.logout',
          targetType: 'user', targetId: rows[0].user_id, requestId: String(req.id),
        });
      }
    }
    const { maxAge: _maxAge, ...clearOpts } = sessionCookieOptions();
    res.clearCookie(SESSION_COOKIE, clearOpts);
    res.status(204).end();
  });

  router.get('/me', authenticate, async (req, res) => {
    res.json({ data: await loadMe(authOf(req).userId) });
  });

  return router;
}

async function loadMe(userId: string) {
  const { rows } = await pool.query<{
    id: string; email: string; name: string; role: Role; org_id: string; org_name: string;
  }>(
    `SELECT u.id, u.email, u.name, u.role, o.id AS org_id, o.name AS org_name
       FROM users u JOIN organisations o ON o.id = u.org_id WHERE u.id = $1`,
    [userId],
  );
  const u = rows[0]!;
  const permissions = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(u.role, p));
  return {
    user: { id: u.id, email: u.email, name: u.name, role: u.role },
    organisation: { id: u.org_id, name: u.org_name },
    // Informational only, so the UI can hide actions; the API enforces them.
    permissions,
  };
}
