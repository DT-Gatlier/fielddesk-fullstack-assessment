import { createHash, randomBytes } from 'node:crypto';

export const digest = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
export const randomToken = (): string => randomBytes(32).toString('base64url');
export function isOpaqueToken(token: string | undefined): token is string {
  return Boolean(token && /^[A-Za-z0-9_-]{43}$/.test(token));
}
