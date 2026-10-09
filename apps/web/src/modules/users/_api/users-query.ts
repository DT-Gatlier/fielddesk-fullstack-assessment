import { apiClient } from '@/api/client';
import type { UserListResDto, UserResDto } from './api.types';
import type { UsersListParams } from './users-keys';

export async function getUsers(
  params: UsersListParams,
  signal?: AbortSignal,
): Promise<UserListResDto> {
  const { data, error } = await apiClient().GET('/api/v1/users', {
    params: {
      query: {
        role: params.role,
        search: params.search,
        page: params.page,
        limit: params.limit,
      },
    },
    signal,
  });
  if (error || !data) {
    throw error || new Error('Failed to load users');
  }
  return data;
}

export async function getUserById(
  userId: string,
  signal?: AbortSignal,
): Promise<UserResDto> {
  const { data, error } = await apiClient().GET('/api/v1/users/{id}', {
    params: { path: { id: userId } },
    signal,
  });
  if (error || !data) {
    throw error || new Error('Failed to load user details');
  }
  return data;
}
