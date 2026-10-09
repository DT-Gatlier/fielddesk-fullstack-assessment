import { ApiProperty } from '@nestjs/swagger';

import type { AttachmentSummary } from '../../../modules/attachment/interfaces/attachment.interface';

export class AttachmentResDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  workOrderId!: string;

  @ApiProperty({ format: 'uuid' })
  uploaderId!: string;

  @ApiProperty()
  uploaderName!: string;

  @ApiProperty()
  originalFileName!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  byteSize!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static fromData(input: AttachmentSummary): AttachmentResDto {
    const res = new AttachmentResDto();
    res.id = input.id;
    res.workOrderId = input.workOrderId;
    res.uploaderId = input.uploaderId;
    res.uploaderName = input.uploaderName;
    res.originalFileName = input.originalFileName;
    res.mimeType = input.mimeType;
    res.byteSize = input.byteSize;
    res.createdAt = input.createdAt.toISOString();
    return res;
  }
}
