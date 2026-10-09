import { UserRole } from '@fielddesk/database';
import { ApiProperty } from '@nestjs/swagger';

import { OrganisationResDto } from '../../../common/dtos/organisation-res.dto';
import type { Identity } from '../../../modules/auth/interfaces/auth-identity.interface';

export class AuthUserResDto {
  static fromData(input: Identity): AuthUserResDto {
    const result = new AuthUserResDto();
    result.id = input.id;
    result.email = input.email;
    result.name = input.name;
    result.role = input.role;
    result.organisation = OrganisationResDto.fromData(input.organisation);
    return result;
  }

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ type: OrganisationResDto })
  organisation!: OrganisationResDto;
}
