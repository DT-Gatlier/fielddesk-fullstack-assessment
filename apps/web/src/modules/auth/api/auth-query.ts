import { apiClient } from '@/api/client';
import { ApiError } from '@/api/error';
import type { UserResDto } from './api.types';
import { assertAuthEpoch, authEpoch } from './auth-transport';

export async function getSession(
  signal?: AbortSignal,
): Promise<UserResDto | null> {
  const expected = authEpoch();
  try {
    const { data } = await apiClient().GET('/api/v1/auth/me', { signal });
    assertAuthEpoch(expected);
    if (!data) throw new Error('Missing session response');
    return data.user;
  } catch (error) {
    assertAuthEpoch(expected);
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
