import { ApiProperty } from '@nestjs/swagger';

export class OrganisationResDto {
  static fromData(input: { id: string; name: string }): OrganisationResDto {
    const result = new OrganisationResDto();
    result.id = input.id;
    result.name = input.name;
    return result;
  }

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}
