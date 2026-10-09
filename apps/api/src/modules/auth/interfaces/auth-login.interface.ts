import type { Identity } from './auth-identity.interface';

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  identity: Identity;
  token: string;
  expiresAt: Date;
}
