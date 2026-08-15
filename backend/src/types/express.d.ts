import { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        orgId: string;
        role: Role;
      };
      orgId?: string; // Always guaranteed by orgScope middleware
      correlationId?: string;
    }
  }
}
