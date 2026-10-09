import { WorkOrderEventType } from '@fielddesk/database';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ProgressEventPayloadDto {
  @ApiPropertyOptional({
    description: 'Target work order status transition if event updates status',
    example: 'in_progress',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  @ApiPropertyOptional({
    description: 'Progress note or field comments',
    example: 'Work commenced on 3rd floor AC compressor',
    maxLength: 2000,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(2000)
  note?: string;

  [key: string]: unknown;
}

export class SubmitProgressEventDto {
  @ApiProperty({
    description: 'Unique client-supplied idempotency key',
    example: 'evt-10001',
    minLength: 1,
    maxLength: 64,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(64)
  eventId!: string;

  @ApiProperty({
    enum: WorkOrderEventType,
    example: WorkOrderEventType.STATUS_CHANGED,
  })
  @IsEnum(WorkOrderEventType)
  type!: WorkOrderEventType;

  @ApiProperty({
    description:
      'ISO-8601 timestamp when the event occurred on the field device',
    example: '2026-08-04T10:30:00.000Z',
    format: 'date-time',
  })
  @Type(() => Date)
  @IsDate()
  occurredAt!: Date;

  @ApiProperty({
    description:
      'Validated progress payload containing optional status and bounded note',
    type: ProgressEventPayloadDto,
    example: { status: 'in_progress', note: 'Technician arrived on site' },
  })
  @IsObject()
  @ValidateNested()
  @Type(() => ProgressEventPayloadDto)
  payload!: ProgressEventPayloadDto;
}
