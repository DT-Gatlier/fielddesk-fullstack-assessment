import { UserRole } from './tenant-context.js';
import { Permission } from './permissions.js';

export interface User {
  id: string;
  organisationId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  organisationName?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organisationId: string;
  organisationName: string;
  permissions?: Permission[];
}

export interface RefreshToken {
  id: string;
  userId: string;
  organisationId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

