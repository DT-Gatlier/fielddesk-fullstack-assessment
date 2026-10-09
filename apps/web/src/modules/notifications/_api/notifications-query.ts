import { apiClient } from '@/api/client';
import { getCsrf } from '@/modules/auth/api/auth-transport';
import type {
  InAppNotificationItemDto,
  InAppNotificationListResDto,
} from './api.types';

export async function getNotifications(
  limit = 25,
  signal?: AbortSignal,
): Promise<InAppNotificationListResDto> {
  const { data, error } = await apiClient().GET('/api/v1/notifications', {
    params: {
      query: { limit },
    },
    signal,
  });

  if (error || !data) {
    throw error || new Error('Failed to load notifications');
  }

  return data as unknown as InAppNotificationListResDto;
}

export async function markNotificationAsRead(
  id: string,
): Promise<InAppNotificationItemDto> {
  const csrf = await getCsrf();
  const { data, error } = await apiClient().PATCH(
    '/api/v1/notifications/{id}/read',
    {
      params: { path: { id } },
      headers: { 'X-CSRF-Token': csrf },
    },
  );

  if (error || !data) {
    throw error || new Error('Failed to mark notification as read');
  }

  return data as unknown as InAppNotificationItemDto;
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const csrf = await getCsrf();
  const { error } = await apiClient().PATCH(
    '/api/v1/notifications/read-all',
    {
      headers: { 'X-CSRF-Token': csrf },
    },
  );

  if (error) {
    throw error;
  }
}

export async function clearAllNotifications(): Promise<void> {
  const csrf = await getCsrf();
  const { error } = await apiClient().DELETE('/api/v1/notifications', {
    headers: { 'X-CSRF-Token': csrf },
  });

  if (error) {
    throw error;
  }
}
