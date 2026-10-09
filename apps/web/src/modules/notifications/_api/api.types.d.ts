export interface InAppNotificationItemDto {
  id: string;
  type: string;
  title: string;
  description: string;
  workOrderId?: string | null;
  reference?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface InAppNotificationListResDto {
  items: InAppNotificationItemDto[];
  unreadCount: number;
}

export interface ListNotificationsQueryParams {
  limit?: number;
  unreadOnly?: boolean;
}
