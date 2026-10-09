import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { InAppNotificationRecord } from '../../../modules/notification/interfaces/in-app-notification.interface';

export class InAppNotificationItemDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty()
  readonly type!: string;

  @ApiProperty()
  readonly title!: string;

  @ApiProperty()
  readonly description!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  readonly workOrderId!: string | null;

  @ApiProperty()
  readonly isRead!: boolean;

  @ApiProperty({ format: 'date-time' })
  readonly createdAt!: string;

  static fromRecord(record: InAppNotificationRecord): InAppNotificationItemDto {
    return {
      id: record.id,
      type: record.type,
      title: record.title,
      description: record.description,
      workOrderId: record.workOrderId,
      isRead: record.isRead,
      createdAt: record.createdAt.toISOString(),
    };
  }
}

export class InAppNotificationListResDto {
  @ApiProperty({ type: [InAppNotificationItemDto] })
  readonly items!: InAppNotificationItemDto[];

  @ApiProperty({ example: 3 })
  readonly unreadCount!: number;
}
