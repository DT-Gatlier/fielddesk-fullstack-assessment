import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../../../shared/config';
import { pool } from '../../../shared/db';
import { forbidden, unauthenticated } from '../lib/errors';
import { can, type Permission } from '../lib/permissions';
import { resolveSession, SESSION_COOKIE } from '../lib/session';
import type { AuthContext } from '../types';

/** Requires a valid session and attaches the server-derived identity to req.auth. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length === 0 || token.length > 200) return next(unauthenticated());
  const auth = await resolveSession(pool, token);
  if (!auth) return next(unauthenticated('Session is invalid or has expired'));
  req.auth = auth;
  req.log = req.log.child({ userId: auth.userId, orgId: auth.orgId, role: auth.role });
  next();
};

/** Role check against the central permission map. Must run after `authenticate`. */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthenticated());
    if (!can(req.auth.role, permission)) return next(forbidden());
    next();
  };
}

/** Narrowing helper for handlers mounted behind `authenticate`. */
export function authOf(req: Request): AuthContext {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const trusted = new Set(config.TRUSTED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean));

/**
 * CSRF defence in depth (the session cookie is already SameSite=Strict):
 * a state-changing request that carries an Origin header must come from a
 * trusted origin or the API's own host.
 */
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // non-browser clients (curl, tests) do not send Origin
  let host: string | undefined;
  try {
    host = new URL(origin).host;
  } catch {
    return next(forbidden('Untrusted request origin'));
  }
  if (trusted.has(origin) || host === req.headers.host) return next();
  next(forbidden('Untrusted request origin'));
}
