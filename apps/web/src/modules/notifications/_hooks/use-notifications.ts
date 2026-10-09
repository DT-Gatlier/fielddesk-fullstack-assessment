'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/modules/auth/hooks/use-session';
import { notificationsKeys } from '../_api/notifications-keys';
import {
  clearAllNotifications,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../_api/notifications-query';
import type {
  InAppNotificationItemDto,
  InAppNotificationListResDto,
} from '../_api/api.types';

export function useNotifications(limit = 25) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const user = session.data;
  const orgId = user?.organisation.id;
  const userId = user?.id;

  const queryKey = orgId && userId ? notificationsKeys.list(orgId, userId) : ['notifications'];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: ({ signal }) => getNotifications(limit, signal),
    enabled: Boolean(orgId && userId),
    staleTime: 1000 * 30, // 30 seconds
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationAsRead(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InAppNotificationListResDto>(queryKey);

      if (previous) {
        const wasUnread = previous.items.some(
          (item: InAppNotificationItemDto) => item.id === id && !item.isRead,
        );
        queryClient.setQueryData<InAppNotificationListResDto>(queryKey, {
          ...previous,
          unreadCount: wasUnread ? Math.max(0, previous.unreadCount - 1) : previous.unreadCount,
          items: previous.items.map((item: InAppNotificationItemDto) =>
            item.id === id ? { ...item, isRead: true } : item,
          ),
        });
      }

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.all });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => markAllNotificationsAsRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InAppNotificationListResDto>(queryKey);

      if (previous) {
        queryClient.setQueryData<InAppNotificationListResDto>(queryKey, {
          ...previous,
          unreadCount: 0,
          items: previous.items.map((item: InAppNotificationItemDto) => ({
            ...item,
            isRead: true,
          })),
        });
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.all });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => clearAllNotifications(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InAppNotificationListResDto>(queryKey);

      queryClient.setQueryData<InAppNotificationListResDto>(queryKey, {
        items: [],
        unreadCount: 0,
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsKeys.all });
    },
  });

  return {
    notifications: data?.items ?? [],
    unreadCount: data?.unreadCount ?? 0,
    isLoading,
    markAsRead: (id: string) => markAsReadMutation.mutate(id),
    markAllAsRead: () => markAllAsReadMutation.mutate(),
    clearAll: () => clearAllMutation.mutate(),
  };
}
