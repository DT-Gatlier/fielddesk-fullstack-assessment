import { apiClient } from '../../../lib/api-client';
import { AuthResponse, RefreshResponse, UserProfile } from '../types/auth.types';

export async function loginApi(email: string, password: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/api/v1/auth/login', { email, password });
  return data;
}

export async function refreshApi(refreshToken: string): Promise<RefreshResponse> {
  const { data } = await apiClient.post<RefreshResponse>('/api/v1/auth/refresh', { refreshToken });
  return data;
}

export async function logoutApi(): Promise<void> {
  await apiClient.post('/api/v1/auth/logout');
}

export async function getMeApi(): Promise<{ user: UserProfile }> {
  const { data } = await apiClient.get<{ user: UserProfile }>('/api/v1/auth/me');
  return data;
}

