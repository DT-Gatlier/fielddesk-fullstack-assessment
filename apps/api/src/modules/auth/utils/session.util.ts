import type { ResolvedSession } from '../interfaces/auth-repository.interface';

export function isActiveSession(
  session: ResolvedSession | null,
): session is ResolvedSession {
  if (!session || session.revokedAt) {
    return false;
  }
  if (!(session.expiresAt.getTime() > Date.now())) {
    return false;
  }
  return session.authVersion === session.user.authVersion;
}

export function sessionExpiry(lifetimeSeconds: number): Date {
  return new Date(Date.now() + lifetimeSeconds * 1000);
}
