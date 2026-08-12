import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { Config } from '../../config.js';
import type { Database } from '../../database/pool.js';
import { forbidden, unauthorised } from '../../common/errors.js';
import { roles, type AuthIdentity, type Role } from './auth.types.js';

export function authenticate(config: Config, database: Database): RequestHandler {
  return async (request, _response, next) => {
    const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) return next(unauthorised());
    try {
      const payload = jwt.verify(token, config.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: 'fielddesk-api',
        audience: 'fielddesk-web'
      }) as jwt.JwtPayload;
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.organisationId !== 'string' ||
        !roles.includes(payload.role as Role) ||
        typeof payload.tokenVersion !== 'number'
      ) throw new Error('Malformed token');
      const identity = {
        userId: payload.sub,
        organisationId: payload.organisationId,
        role: payload.role as Role,
        tokenVersion: payload.tokenVersion
      } satisfies AuthIdentity;
      const active = await database.query(
        'SELECT 1 FROM users WHERE id = $1 AND organisation_id = $2 AND is_active = true AND token_version = $3',
        [identity.userId, identity.organisationId, identity.tokenVersion]
      );
      if (!active.rowCount) throw new Error('Revoked token');
      request.identity = identity;
      next();
    } catch {
      next(unauthorised('Invalid or expired access token'));
    }
  };
}

export function requireRoles(...allowed: Role[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.identity) return next(unauthorised());
    if (!allowed.includes(request.identity.role)) return next(forbidden());
    next();
  };
}

export function getIdentity(identity: AuthIdentity | undefined): AuthIdentity {
  if (!identity) throw unauthorised();
  return identity;
}
