import type { UserRole } from './api.types';

export interface UsersListParams {
  role?: UserRole;
  search?: string;
  page?: number;
  limit?: number;
}

export const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'list'] as const,
  list: (orgId: string, params: UsersListParams) =>
    [...usersKeys.lists(), orgId, params] as const,
  details: () => [...usersKeys.all, 'detail'] as const,
  detail: (orgId: string, userId: string) =>
    [...usersKeys.details(), orgId, userId] as const,
};
