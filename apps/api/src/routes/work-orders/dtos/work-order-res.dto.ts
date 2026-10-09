import { WorkOrderPriority, WorkOrderStatus } from '@fielddesk/database';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { WorkOrderSummary } from '../../../modules/work-order/interfaces/work-order.interface';

export class WorkOrderResDto {
  static fromData(input: WorkOrderSummary): WorkOrderResDto {
    const result = new WorkOrderResDto();
    result.id = input.id;
    result.organisationId = input.organisationId;
    result.reference = input.reference;
    result.title = input.title;
    result.description = input.description;
    result.priority = input.priority;
    result.status = input.status;
    result.siteName = input.siteName;
    result.creatorId = input.creatorId;
    result.creatorName = input.creatorName;
    result.assignedTechnicianId = input.assignedTechnicianId;
    result.assignedTechnicianName = input.assignedTechnicianName;
    result.scheduledStart = input.scheduledStart?.toISOString() ?? null;
    result.scheduledEnd = input.scheduledEnd?.toISOString() ?? null;
    result.createdAt = input.createdAt.toISOString();
    result.updatedAt = input.updatedAt.toISOString();
    return result;
  }

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organisationId!: string;

  @ApiProperty({ example: 'WO-0001' })
  reference!: string;

  @ApiProperty({ example: 'HVAC repair on 3rd floor' })
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: WorkOrderPriority })
  priority!: WorkOrderPriority;

  @ApiProperty({ enum: WorkOrderStatus })
  status!: WorkOrderStatus;

  @ApiProperty({ example: 'Main Headquarters' })
  siteName!: string;

  @ApiProperty({ format: 'uuid' })
  creatorId!: string;

  @ApiProperty()
  creatorName!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  assignedTechnicianId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  assignedTechnicianName!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  scheduledStart!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  scheduledEnd!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
