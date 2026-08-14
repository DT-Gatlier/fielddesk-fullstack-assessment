import type { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  organisationId: string;
  role: UserRole;
  email: string;
  name: string;
}

export interface JwtPayload {
  sub: string;
  organisationId: string;
  role: UserRole;
}