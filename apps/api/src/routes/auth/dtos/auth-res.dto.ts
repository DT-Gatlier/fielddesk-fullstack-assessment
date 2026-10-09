import { ApiProperty } from '@nestjs/swagger';

import type { Identity } from '../../../modules/auth/interfaces/auth-identity.interface';
import { AuthUserResDto } from './user-res.dto';

export class AuthResDto {
  static fromData(input: Identity): AuthResDto {
    const result = new AuthResDto();
    result.user = AuthUserResDto.fromData(input);
    return result;
  }

  @ApiProperty({ type: AuthUserResDto })
  user!: AuthUserResDto;
}
