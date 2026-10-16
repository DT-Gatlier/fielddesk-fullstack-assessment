import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions } from 'express';
import { config } from '../../../shared/config';
import type { Db } from '../../../shared/db';
import type { AuthContext, Role } from '../types';

export const SESSION_COOKIE = 'fd_session';

/** Only the SHA-256 of the token is stored, so a database leak does not leak live sessions. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true, // not readable from JavaScript
    secure: config.COOKIE_SECURE, // true in any HTTPS deployment
    sameSite: 'strict', // not sent on cross-site requests (CSRF mitigation)
    path: '/',
    maxAge: config.SESSION_TTL_HOURS * 3600_000,
  };
}

export async function createSession(db: Db, userId: string, meta: { userAgent?: string; ip?: string }) {
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip)
     VALUES ($1, $2, now() + make_interval(secs => $3), $4, $5)`,
    [hashToken(token), userId, config.SESSION_TTL_HOURS * 3600, meta.userAgent?.slice(0, 300) ?? null, meta.ip ?? null],
  );
  return token;
}

/**
 * Resolves a session token to the current identity. Organisation and role
 * come from the users table at request time, so role changes and
 * deactivation take effect on the very next request.
 */
export async function resolveSession(db: Db, token: string): Promise<AuthContext | null> {
  const tokenHash = hashToken(token);
  const { rows } = await db.query<{ id: string; org_id: string; role: Role; name: string; email: string }>(
    `SELECT u.id, u.org_id, u.role, u.name, u.email
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active`,
    [tokenHash],
  );
  const u = rows[0];
  if (!u) return null;
  return { userId: u.id, orgId: u.org_id, role: u.role, name: u.name, email: u.email, sessionTokenHash: tokenHash };
}

export async function destroySession(db: Db, tokenHash: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

export async function destroyUserSessions(db: Db, userId: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}
