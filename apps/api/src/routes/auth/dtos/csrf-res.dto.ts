import { ApiProperty } from '@nestjs/swagger';

export class CsrfResDto {
  @ApiProperty()
  csrfToken!: string;

  static fromData(token: string): CsrfResDto {
    const result = new CsrfResDto();
    result.csrfToken = token;
    return result;
  }
}
