import { createHash, randomBytes } from 'node:crypto';
import { withOrg, type Pool } from '../db/pool.js';

export type Role = 'owner' | 'dispatcher' | 'technician';
export const ROLES: readonly Role[] = ['owner', 'dispatcher', 'technician'];

/** The authenticated identity. orgId and role always come from the database, never from the client. */
export interface AuthContext {
  sessionId: string;
  userId: string;
  orgId: string;
  role: Role;
  name: string;
  email: string;
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export async function createSession(
  pool: Pool,
  user: { id: string; orgId: string },
  ttlHours: number,
  meta: { userAgent?: string; ip?: string },
): Promise<{ token: string; expiresAt: Date }> {
  // 256 bits of randomness; only the hash is stored, so a database leak does not yield usable tokens.
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
  await withOrg(pool, user.orgId, (client) =>
    client.query(
      `INSERT INTO sessions (token_hash, org_id, user_id, expires_at, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [hashToken(token), user.orgId, user.id, expiresAt, meta.userAgent?.slice(0, 500) ?? null, meta.ip ?? null],
    ),
  );
  return { token, expiresAt };
}

/** Resolves a cookie token to its user. Returns null for unknown, expired, revoked or deactivated sessions. */
export async function resolveSession(pool: Pool, token: string): Promise<AuthContext | null> {
  const { rows } = await pool.query<{
    session_id: string;
    user_id: string;
    org_id: string;
    role: Role;
    name: string;
    email: string;
  }>('SELECT session_id, user_id, org_id, role, name, email FROM auth_resolve_session($1)', [hashToken(token)]);
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    orgId: row.org_id,
    role: row.role,
    name: row.name,
    email: row.email,
  };
}

export async function revokeSession(pool: Pool, auth: AuthContext): Promise<void> {
  await withOrg(pool, auth.orgId, (client) =>
    client.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [auth.sessionId]),
  );
}
