import type { Logger } from 'pino';

export type Role = 'owner' | 'dispatcher' | 'technician';
export const ROLES: readonly Role[] = ['owner', 'dispatcher', 'technician'];

/**
 * The authenticated identity, loaded from the server-side session and the
 * users table on every request. This is the ONLY source of organisation and
 * role used for authorisation; nothing the client sends can change it.
 */
export interface AuthContext {
  userId: string;
  orgId: string;
  role: Role;
  name: string;
  email: string;
  sessionTokenHash: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      log: Logger;
      auth?: AuthContext;
    }
  }
}
