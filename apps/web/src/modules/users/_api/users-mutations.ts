import { apiClient } from '@/api/client';
import { assertAuthEpoch, authEpoch, getCsrf } from '@/modules/auth/api/auth-transport';
import type { CreateUserDto, UpdateUserDto, UpdateUserRoleDto, UserResDto } from './api.types';

export async function createUser(input: CreateUserDto): Promise<UserResDto> {
  const expected = authEpoch();
  const csrf = await getCsrf();
  const { data, error } = await apiClient().POST('/api/v1/users', {
    body: input,
    headers: { 'X-CSRF-Token': csrf },
  });
  assertAuthEpoch(expected);
  if (error || !data) {
    throw error || new Error('Failed to create user');
  }
  return data;
}

export async function updateUser(userId: string, input: UpdateUserDto): Promise<UserResDto> {
  const expected = authEpoch();
  const csrf = await getCsrf();
  const { data, error } = await apiClient().PATCH('/api/v1/users/{id}', {
    params: { path: { id: userId } },
    body: input,
    headers: { 'X-CSRF-Token': csrf },
  });
  assertAuthEpoch(expected);
  if (error || !data) {
    throw error || new Error('Failed to update user');
  }
  return data;
}

export async function updateUserRole(userId: string, input: UpdateUserRoleDto): Promise<UserResDto> {
  const expected = authEpoch();
  const csrf = await getCsrf();
  const { data, error } = await apiClient().PUT('/api/v1/users/{id}/role', {
    params: { path: { id: userId } },
    body: input,
    headers: { 'X-CSRF-Token': csrf },
  });
  assertAuthEpoch(expected);
  if (error || !data) {
    throw error || new Error('Failed to update user role');
  }
  return data;
}
