import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type {
  CreateInAppNotificationInput,
  InAppNotificationRecord,
  InAppNotificationRepositoryPort,
  ListInAppNotificationsInput,
} from '../interfaces/in-app-notification.interface';

@Injectable()
export class InAppNotificationRepository
  implements InAppNotificationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async createMany(
    inputs: CreateInAppNotificationInput[],
  ): Promise<InAppNotificationRecord[]> {
    if (inputs.length === 0) {
      return [];
    }

    // Execute in a transaction to return the created records
    return this.prisma.client.$transaction(async (tx) => {
      const records: InAppNotificationRecord[] = [];
      for (const input of inputs) {
        const row = await tx.inAppNotification.create({
          data: {
            organisationId: input.organisationId,
            userId: input.userId,
            actorId: input.actorId ?? null,
            workOrderId: input.workOrderId ?? null,
            type: input.type,
            title: input.title,
            description: input.description,
            isRead: false,
          },
        });
        records.push({
          id: row.id,
          organisationId: row.organisationId,
          userId: row.userId,
          actorId: row.actorId,
          workOrderId: row.workOrderId,
          type: row.type,
          title: row.title,
          description: row.description,
          isRead: row.isRead,
          createdAt: row.createdAt,
        });
      }
      return records;
    });
  }

  async listByUser(
    input: ListInAppNotificationsInput,
  ): Promise<InAppNotificationRecord[]> {
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);

    const rows = await this.prisma.client.inAppNotification.findMany({
      where: {
        organisationId: input.organisationId,
        userId: input.userId,
        ...(input.unreadOnly ? { isRead: false } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      organisationId: row.organisationId,
      userId: row.userId,
      actorId: row.actorId,
      workOrderId: row.workOrderId,
      type: row.type,
      title: row.title,
      description: row.description,
      isRead: row.isRead,
      createdAt: row.createdAt,
    }));
  }

  async countUnread(organisationId: string, userId: string): Promise<number> {
    return this.prisma.client.inAppNotification.count({
      where: {
        organisationId,
        userId,
        isRead: false,
      },
    });
  }

  async markAsRead(
    organisationId: string,
    userId: string,
    notificationId: string,
  ): Promise<InAppNotificationRecord | null> {
    const existing = await this.prisma.client.inAppNotification.findFirst({
      where: {
        id: notificationId,
        organisationId,
        userId,
      },
    });

    if (!existing) {
      return null;
    }

    const updated = await this.prisma.client.inAppNotification.update({
      where: {
        id: notificationId,
      },
      data: {
        isRead: true,
      },
    });

    return {
      id: updated.id,
      organisationId: updated.organisationId,
      userId: updated.userId,
      actorId: updated.actorId,
      workOrderId: updated.workOrderId,
      type: updated.type,
      title: updated.title,
      description: updated.description,
      isRead: updated.isRead,
      createdAt: updated.createdAt,
    };
  }

  async markAllAsRead(
    organisationId: string,
    userId: string,
  ): Promise<number> {
    const result = await this.prisma.client.inAppNotification.updateMany({
      where: {
        organisationId,
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    return result.count;
  }

  async clearAll(organisationId: string, userId: string): Promise<number> {
    const result = await this.prisma.client.inAppNotification.deleteMany({
      where: {
        organisationId,
        userId,
      },
    });

    return result.count;
  }
}
