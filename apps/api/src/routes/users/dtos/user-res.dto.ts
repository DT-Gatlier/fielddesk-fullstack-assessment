import { UserRole } from '@fielddesk/database';
import { ApiProperty } from '@nestjs/swagger';

import type { UserModel } from '../../../modules/user/interfaces/user.interface';

export class UserResDto {
  static fromData(input: UserModel): UserResDto {
    const result = new UserResDto();
    result.id = input.id;
    result.organisationId = input.organisationId;
    result.email = input.email;
    result.name = input.name;
    result.role = input.role;
    result.createdAt = input.createdAt.toISOString();
    return result;
  }

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organisationId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
