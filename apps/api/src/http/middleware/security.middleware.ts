import {
  ForbiddenException,
  HttpException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { csrfSync } from 'csrf-sync';
import type { Request, Response, NextFunction } from 'express';

import type { ApiEnvironment } from '../../config/environment';
import type { RedisService } from '../../infrastructure/redis/redis.service';
import type { AuthService } from '../../modules/auth/services/auth.service';
import { digest } from '../../modules/auth/utils/token.util';
import { SESSION_COOKIE, ANONYMOUS_COOKIE } from '../cookie-policy';
import type {
  SecurityRequest,
  SecurityMiddleware,
} from '../interfaces/security-request.interface';
import { normalizeEmailInput } from '../utils/email-input.util';

function cookie(request: Request, name: string): string | undefined {
  const cookies: unknown = request.cookies;
  if (typeof cookies === 'object' && cookies !== null && name in cookies) {
    const value: unknown = (cookies as Record<string, unknown>)[name];
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}

export function securityMiddleware(
  auth: AuthService,
  redis: RedisService,
  config: ConfigService<ApiEnvironment, true>,
): SecurityMiddleware {
  const csrf = csrfSync({
    getTokenFromState: (request) =>
      (request as SecurityRequest).security.csrfToken,
    getTokenFromRequest: (request) =>
      typeof request.headers['x-csrf-token'] === 'string'
        ? request.headers['x-csrf-token']
        : undefined,
    storeTokenInState: () => {
      throw new Error('CSRF tokens are persisted by the security service');
    },
  });
  return (request: SecurityRequest, response: Response, next: NextFunction) => {
    const resolve = async (): Promise<void> => {
      request.security = {};
      if (!request.path.startsWith('/api/v1/')) {
        return;
      }
      request.security = await auth.resolveSecurityState(
        cookie(request, SESSION_COOKIE),
        cookie(request, ANONYMOUS_COOKIE),
      );
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        return;
      }
      const origin = request.headers.origin;
      if (
        !origin ||
        !config.get('ALLOWED_ORIGINS', { infer: true }).includes(origin)
      ) {
        throw new ForbiddenException('Origin not allowed');
      }
      if (!csrf.isRequestValid(request)) {
        throw new ForbiddenException('Invalid CSRF token');
      }
      if (request.path === '/api/v1/auth/login') {
        await enforceLoginLimit(request, response, redis);
      }
    };
    void resolve().then(
      () => next(),
      (error: unknown) => next(error),
    );
  };
}

function loginEmail(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('email' in body)) {
    return '';
  }
  const email = normalizeEmailInput(body.email);
  return typeof email === 'string' ? email : '';
}

async function enforceLoginLimit(
  request: SecurityRequest,
  response: Response,
  redis: RedisService,
): Promise<void> {
  if (!request.is('application/json')) {
    throw new UnsupportedMediaTypeException('Login requires application/json');
  }
  const body: unknown = request.body;
  const email = loginEmail(body);
  const retryAfter = await redis.loginLimit(
    digest(request.ip ?? 'unknown'),
    digest(email),
  );
  if (retryAfter > 0) {
    response.setHeader('Retry-After', String(retryAfter));
    throw new HttpException('Too many login attempts', 429);
  }
}
