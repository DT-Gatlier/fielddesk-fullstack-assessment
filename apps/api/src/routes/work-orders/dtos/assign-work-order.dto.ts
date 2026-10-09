import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsUUID } from 'class-validator';

export class AssignWorkOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  assignedTechnicianId!: string;

  @ApiProperty({ format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  scheduledStart!: Date;

  @ApiProperty({ format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  scheduledEnd!: Date;
}
