import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentIdentity } from '../../http/decorators/auth.decorators';
import type { Identity } from '../../modules/auth/interfaces/auth-identity.interface';
import { InAppNotificationService } from '../../modules/notification/services/in-app-notification.service';
import {
  InAppNotificationItemDto,
  InAppNotificationListResDto,
} from './dtos/in-app-notification-res.dto';
import { ListNotificationsQueryDto } from './dtos/list-notifications-query.dto';

@ApiTags('Notifications')
@ApiCookieAuth('session')
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: InAppNotificationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List recent notifications for the authenticated user' })
  @ApiResponse({ status: 200, type: InAppNotificationListResDto })
  async list(
    @CurrentIdentity() identity: Identity,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<InAppNotificationListResDto> {
    const { items, unreadCount } = await this.notifications.listNotifications({
      organisationId: identity.organisation.id,
      userId: identity.id,
      limit: query.limit,
      unreadOnly: query.unreadOnly,
    });

    return {
      items: items.map((record) => InAppNotificationItemDto.fromRecord(record)),
      unreadCount,
    };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a specific notification as read' })
  @ApiResponse({ status: 200, type: InAppNotificationItemDto })
  async markRead(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InAppNotificationItemDto> {
    const updated = await this.notifications.markAsRead(
      identity.organisation.id,
      identity.id,
      id,
    );

    if (!updated) {
      throw new NotFoundException('Notification not found');
    }

    return InAppNotificationItemDto.fromRecord(updated);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read for current user' })
  @ApiResponse({ status: 200 })
  async markAllRead(
    @CurrentIdentity() identity: Identity,
  ): Promise<{ updatedCount: number }> {
    const count = await this.notifications.markAllAsRead(
      identity.organisation.id,
      identity.id,
    );
    return { updatedCount: count };
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Clear all notifications for the authenticated user' })
  @ApiResponse({ status: 204 })
  async clearAll(
    @CurrentIdentity() identity: Identity,
  ): Promise<void> {
    await this.notifications.clearAll(
      identity.organisation.id,
      identity.id,
    );
  }
}
