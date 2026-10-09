import { WorkOrderEventType } from '@fielddesk/database';
import { ApiProperty } from '@nestjs/swagger';

import type { WorkOrderEventSummary } from '../../../modules/work-order/interfaces/work-order-event.interface';

export class WorkOrderEventUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Arjun Nair' })
  name!: string;

  @ApiProperty({ example: 'TECHNICIAN' })
  role!: string;
}

export class WorkOrderEventResDto {
  static fromData(input: WorkOrderEventSummary): WorkOrderEventResDto {
    const result = new WorkOrderEventResDto();
    result.id = input.id;
    result.eventId = input.eventId;
    result.organisationId = input.organisationId;
    result.workOrderId = input.workOrderId;
    result.type = input.type;
    result.occurredAt = input.occurredAt.toISOString();
    result.payload = input.payload;
    result.createdAt = input.createdAt.toISOString();
    result.user = {
      id: input.userId,
      name: input.userName,
      role: input.userRole,
    };
    return result;
  }

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'evt-10001' })
  eventId!: string;

  @ApiProperty({ format: 'uuid' })
  organisationId!: string;

  @ApiProperty({ format: 'uuid' })
  workOrderId!: string;

  @ApiProperty({ enum: WorkOrderEventType })
  type!: WorkOrderEventType;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({
    description: 'Event payload object',
    example: { status: 'in_progress', note: 'Technician arrived on site' },
  })
  payload!: Record<string, unknown>;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: WorkOrderEventUserDto })
  user!: WorkOrderEventUserDto;
}
