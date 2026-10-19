import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { forbidden, unauthenticated } from '../http/errors.js';
import { resolveSession, type AuthContext, type Role } from './sessions.js';

export const SESSION_COOKIE = 'fd_session';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

/** Rejects the request with 401 unless it carries a valid session cookie. */
export const authenticate: preHandlerAsyncHookHandler = async function (request: FastifyRequest, _reply: FastifyReply) {
  const token = request.cookies[SESSION_COOKIE];
  if (!token || token.length > 128) throw unauthenticated();
  const auth = await resolveSession(this.pg, token);
  if (!auth) throw unauthenticated('Your session is invalid or has expired.');
  request.auth = auth;
  request.log = request.log.child({ userId: auth.userId, orgId: auth.orgId });
};

/** Authenticates, then rejects with 403 unless the user's role (from the database) is allowed. */
export function requireRole(...allowed: Role[]): preHandlerAsyncHookHandler {
  return async function (request, reply) {
    await authenticate.call(this, request, reply);
    if (!allowed.includes(request.auth!.role)) throw forbidden();
  };
}

/** For handlers behind authenticate/requireRole. */
export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthenticated();
  return request.auth;
}
