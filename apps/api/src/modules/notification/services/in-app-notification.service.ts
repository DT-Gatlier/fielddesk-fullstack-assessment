import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { RealtimeEventType } from '../../realtime/interfaces/realtime.interface';
import { RealtimeService } from '../../realtime/services/realtime.service';
import type {
  CreateInAppNotificationInput,
  InAppNotificationRecord,
  InAppNotificationRepositoryPort,
  ListInAppNotificationsInput,
} from '../interfaces/in-app-notification.interface';

export interface DispatchNotificationEventInput {
  organisationId: string;
  actorId: string;
  type: string;
  workOrderId?: string;
  reference?: string;
  assignedTechnicianId?: string | null;
  previousTechnicianId?: string | null;
  status?: string;
  note?: string;
}

@Injectable()
export class InAppNotificationService {
  private readonly logger = new Logger(InAppNotificationService.name);

  constructor(
    @Inject('InAppNotificationRepositoryPort')
    private readonly repository: InAppNotificationRepositoryPort,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Dispatches notifications to target recipients while strictly EXCLUDING the actor.
   * Persists in DB and broadcasts live via Redis/SSE.
   */
  async dispatchNotification(
    input: DispatchNotificationEventInput,
  ): Promise<InAppNotificationRecord[]> {
    const {
      organisationId,
      actorId,
      type,
      workOrderId,
      reference,
      assignedTechnicianId,
      previousTechnicianId,
      status,
      note,
    } = input;

    const ref = reference || 'Work Order';
    const inputsToCreate: CreateInAppNotificationInput[] = [];

    // Fetch all owners & dispatchers in this organisation
    const staff = await this.prisma.client.user.findMany({
      where: {
        organisationId,
        role: { in: ['OWNER', 'DISPATCHER'] },
      },
      select: { id: true, role: true },
    });

    switch (type) {
      case 'WORK_ORDER_ASSIGNED': {
        // 1. Newly assigned technician (if not actor)
        if (assignedTechnicianId && assignedTechnicianId !== actorId) {
          inputsToCreate.push({
            organisationId,
            userId: assignedTechnicianId,
            actorId,
            workOrderId,
            type,
            title: 'New Assignment',
            description: `You were assigned to ${ref}.`,
          });
        }
        // 2. Previous technician who was replaced (if not actor)
        if (
          previousTechnicianId &&
          previousTechnicianId !== assignedTechnicianId &&
          previousTechnicianId !== actorId
        ) {
          inputsToCreate.push({
            organisationId,
            userId: previousTechnicianId,
            actorId,
            workOrderId,
            type: 'WORK_ORDER_UNASSIGNED',
            title: 'Assignment Removed',
            description: `You were unassigned from ${ref}.`,
          });
        }
        break;
      }

      case 'WORK_ORDER_UNASSIGNED': {
        if (assignedTechnicianId && assignedTechnicianId !== actorId) {
          inputsToCreate.push({
            organisationId,
            userId: assignedTechnicianId,
            actorId,
            workOrderId,
            type,
            title: 'Assignment Removed',
            description: `You were unassigned from ${ref}.`,
          });
        }
        break;
      }

      case 'PROGRESS_EVENT_ADDED': {
        // When a technician submits progress, notify all owners and dispatchers (excluding actor)
        for (const member of staff) {
          if (member.id !== actorId) {
            inputsToCreate.push({
              organisationId,
              userId: member.id,
              actorId,
              workOrderId,
              type,
              title: 'Progress Recorded',
              description: note
                ? `Progress on ${ref}: ${note}`
                : `Progress was recorded on ${ref}.`,
            });
          }
        }
        break;
      }

      case 'WORK_ORDER_STATUS_CHANGED': {
        // Notify assigned technician if actor was staff
        if (assignedTechnicianId && assignedTechnicianId !== actorId) {
          inputsToCreate.push({
            organisationId,
            userId: assignedTechnicianId,
            actorId,
            workOrderId,
            type,
            title: 'Status Updated',
            description: `${ref} status changed to ${status ?? 'updated'}.`,
          });
        }
        // Notify staff if actor was technician
        for (const member of staff) {
          if (member.id !== actorId) {
            inputsToCreate.push({
              organisationId,
              userId: member.id,
              actorId,
              workOrderId,
              type,
              title: 'Status Updated',
              description: `${ref} status changed to ${status ?? 'updated'}.`,
            });
          }
        }
        break;
      }

      case 'WORK_ORDER_CREATED': {
        // If technician assigned at creation, notify them (excluding actor)
        if (assignedTechnicianId && assignedTechnicianId !== actorId) {
          inputsToCreate.push({
            organisationId,
            userId: assignedTechnicianId,
            actorId,
            workOrderId,
            type,
            title: 'New Assignment',
            description: `You were assigned to new work order ${ref}.`,
          });
        }
        break;
      }
    }

    if (inputsToCreate.length === 0) {
      return [];
    }

    // Persist records
    const created = await this.repository.createMany(inputsToCreate);

    // Broadcast SSE push for live UI bell updates
    for (const record of created) {
      if (record.workOrderId) {
        void this.realtime.broadcastToOrganisation(organisationId, {
          type: record.type as RealtimeEventType,
          workOrderId: record.workOrderId,
          reference: ref,
          assignedTechnicianId: record.userId,
          data: {
            notificationId: record.id,
            title: record.title,
            description: record.description,
            userId: record.userId,
            actorId: record.actorId,
            createdAt: record.createdAt.toISOString(),
          },
        });
      }
    }

    return created;
  }

  async listNotifications(
    input: ListInAppNotificationsInput,
  ): Promise<{ items: InAppNotificationRecord[]; unreadCount: number }> {
    const [items, unreadCount] = await Promise.all([
      this.repository.listByUser(input),
      this.repository.countUnread(input.organisationId, input.userId),
    ]);
    return { items, unreadCount };
  }

  async markAsRead(
    organisationId: string,
    userId: string,
    notificationId: string,
  ): Promise<InAppNotificationRecord | null> {
    return this.repository.markAsRead(organisationId, userId, notificationId);
  }

  async markAllAsRead(
    organisationId: string,
    userId: string,
  ): Promise<number> {
    return this.repository.markAllAsRead(organisationId, userId);
  }

  async clearAll(organisationId: string, userId: string): Promise<number> {
    return this.repository.clearAll(organisationId, userId);
  }
}
