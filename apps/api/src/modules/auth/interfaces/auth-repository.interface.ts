import type { TenantContext } from '../../../common/interfaces/tenant-context.interface';
import type { Identity } from './auth-identity.interface';

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');

export interface Credentials {
  id: string;
  passwordHash: string;
  authVersion: number;
}

export interface ResolvedSession {
  id: string;
  csrfToken: string;
  expiresAt: Date;
  revokedAt: Date | null;
  authVersion: number;
  user: Identity & { authVersion: number };
}

export interface IssueSessionInput {
  verified: Credentials;
  tokenHash: string;
  csrfToken: string;
  expiresAt: Date;
  previousSessionId?: string;
}

export interface TenantUserInput extends TenantContext {
  userId: string;
}

export interface AuthRepositoryPort {
  findCredentials(email: string): Promise<Credentials | null>;
  findSession(tokenHash: string): Promise<ResolvedSession | null>;
  issueSession(input: IssueSessionInput): Promise<Identity>;
  revokeAll(userId: string): Promise<void>;
  revoke(sessionId: string): Promise<void>;
  tenantUser(input: TenantUserInput): Promise<Identity>;
}
