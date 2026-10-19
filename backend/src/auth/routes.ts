import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withOrg } from '../db/pool.js';
import { AppError } from '../http/errors.js';
import { parse } from '../http/validation.js';
import { authenticate, authOf, SESSION_COOKIE } from './guards.js';
import { verifyAgainstDummy, verifyPassword } from './password.js';
import { createSession, revokeSession, type AuthContext, type Role } from './sessions.js';

// .strict(): unknown fields such as orgId or role are rejected rather than silently ignored.
const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(1024),
  })
  .strict();

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

async function currentUser(app: FastifyInstance, auth: Pick<AuthContext, 'userId' | 'orgId' | 'role' | 'name' | 'email'>) {
  const organisation = await withOrg(app.pg, auth.orgId, async (client) => {
    const { rows } = await client.query<{ id: string; name: string }>('SELECT id, name FROM organisations WHERE id = $1', [
      auth.orgId,
    ]);
    return rows[0];
  });
  return {
    id: auth.userId,
    name: auth.name,
    email: auth.email,
    role: auth.role,
    organisation,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: app.config.LOGIN_RATE_LIMIT_MAX,
          timeWindow: app.config.LOGIN_RATE_LIMIT_WINDOW,
          keyGenerator: (request) => `login:${request.ip}`,
        },
      },
    },
    async (request, reply) => {
      const { email, password } = parse(loginSchema, request.body);

      const { rows } = await app.pg.query<{
        id: string;
        org_id: string;
        role: Role;
        name: string;
        email: string;
        password_hash: string;
        is_active: boolean;
      }>('SELECT * FROM auth_find_user_by_email($1)', [email]);
      const user = rows[0];

      // Same response (and similar timing) for unknown email, wrong password and deactivated account.
      const valid = user ? await verifyPassword(password, user.password_hash) : await verifyAgainstDummy(password);
      if (!user || !valid || !user.is_active) {
        request.log.info({ event: 'login_failed' }, 'login failed');
        throw invalidCredentials();
      }

      const { token, expiresAt } = await createSession(
        app.pg,
        { id: user.id, orgId: user.org_id },
        app.config.SESSION_TTL_HOURS,
        { userAgent: request.headers['user-agent'], ip: request.ip },
      );

      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: app.config.COOKIE_SECURE,
        sameSite: 'strict',
        path: '/',
        expires: expiresAt,
      });
      request.log.info({ event: 'login_succeeded', userId: user.id, orgId: user.org_id }, 'login succeeded');

      return {
        user: await currentUser(app, {
          userId: user.id,
          orgId: user.org_id,
          role: user.role,
          name: user.name,
          email: user.email,
        }),
      };
    },
  );

  app.post('/api/auth/logout', { preHandler: authenticate }, async (request, reply) => {
    await revokeSession(app.pg, authOf(request));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/api/auth/me', { preHandler: authenticate }, async (request) => {
    return { user: await currentUser(app, authOf(request)) };
  });
}
