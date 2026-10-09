import type { Identity } from './auth-identity.interface';

export interface SecurityState {
  identity?: Identity;
  sessionId?: string;
  csrfToken?: string;
  anonymousHash?: string;
  staleSession?: boolean;
}

export interface CsrfBootstrapResult {
  csrfToken: string;
  anonymousToken?: string;
}
