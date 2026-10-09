import { apiClient } from '@/api/client';
import type { LoginDto } from './api.types';
import { invalidateCsrf, withCsrf } from './auth-transport';

export async function login(input: LoginDto): Promise<void> {
  await withCsrf(async (token) => {
    await apiClient().POST('/api/v1/auth/login', {
      body: input,
      params: {
        header: {
          'X-CSRF-Token': token,
          Origin: globalThis.location?.origin ?? '',
        },
      },
    });
  });
}

export async function logout(): Promise<void> {
  // Fetch current protection even when a session has expired while the tab was idle.
  invalidateCsrf();
  await withCsrf(async (token) => {
    await apiClient().POST('/api/v1/auth/logout', {
      params: { header: { 'X-CSRF-Token': token } },
    });
  });
}
