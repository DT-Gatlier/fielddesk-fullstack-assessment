import { UserRole } from '@fielddesk/database';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class UpdateUserRoleDto {
  @ApiProperty({ enum: UserRole, example: UserRole.DISPATCHER })
  @IsEnum(UserRole)
  role!: UserRole;
}
