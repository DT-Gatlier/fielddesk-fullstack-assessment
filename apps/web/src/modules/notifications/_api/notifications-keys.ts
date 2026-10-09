export const notificationsKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationsKeys.all, 'list'] as const,
  list: (orgId: string, userId: string) =>
    [...notificationsKeys.lists(), orgId, userId] as const,
};
