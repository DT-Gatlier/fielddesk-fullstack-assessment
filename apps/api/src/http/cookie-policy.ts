import type { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';

import type { ApiEnvironment } from '../config/environment';

export const SESSION_COOKIE = 'fielddesk_session';
export const ANONYMOUS_COOKIE = 'fielddesk_anonymous';
export function cookieOptions(
  config: ConfigService<ApiEnvironment, true>,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.get('COOKIE_SECURE', { infer: true }),
    path: '/api/v1',
  };
}
