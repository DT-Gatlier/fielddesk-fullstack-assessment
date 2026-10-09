import type { UserRole } from '@fielddesk/database';

export interface UserModel {
  id: string;
  organisationId: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

export interface CreateUserEntityInput {
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
}

export interface UpdateUserInput {
  name?: string;
}

export interface UpdateUserRoleInput {
  role: UserRole;
}

export interface UserFilterInput {
  role?: UserRole;
  search?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedUsers {
  items: UserModel[];
  total: number;
  page: number;
  limit: number;
}
