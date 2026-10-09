import { ApiProperty } from '@nestjs/swagger';

import type { PaginatedUsers } from '../../../modules/user/interfaces/user.interface';
import { UserResDto } from './user-res.dto';

export class UserListResDto {
  static fromData(input: PaginatedUsers): UserListResDto {
    const result = new UserListResDto();
    result.items = input.items.map((user) => UserResDto.fromData(user));
    result.total = input.total;
    result.page = input.page;
    result.limit = input.limit;
    return result;
  }

  @ApiProperty({ type: [UserResDto] })
  items!: UserResDto[];

  @ApiProperty({ example: 10 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
