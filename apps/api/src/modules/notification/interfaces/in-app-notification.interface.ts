export interface InAppNotificationRecord {
  id: string;
  organisationId: string;
  userId: string;
  actorId: string | null;
  workOrderId: string | null;
  type: string;
  title: string;
  description: string;
  isRead: boolean;
  createdAt: Date;
}

export interface CreateInAppNotificationInput {
  organisationId: string;
  userId: string;
  actorId?: string | null;
  workOrderId?: string | null;
  type: string;
  title: string;
  description: string;
}

export interface ListInAppNotificationsInput {
  organisationId: string;
  userId: string;
  limit?: number;
  unreadOnly?: boolean;
}

export interface InAppNotificationRepositoryPort {
  createMany(
    inputs: CreateInAppNotificationInput[],
  ): Promise<InAppNotificationRecord[]>;

  listByUser(
    input: ListInAppNotificationsInput,
  ): Promise<InAppNotificationRecord[]>;

  countUnread(organisationId: string, userId: string): Promise<number>;

  markAsRead(
    organisationId: string,
    userId: string,
    notificationId: string,
  ): Promise<InAppNotificationRecord | null>;

  markAllAsRead(organisationId: string, userId: string): Promise<number>;

  clearAll(organisationId: string, userId: string): Promise<number>;
}
