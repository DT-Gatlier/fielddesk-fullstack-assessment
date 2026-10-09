import { ApiProperty } from '@nestjs/swagger';

import type { StorageQuotaUsage } from '../../../modules/attachment/interfaces/attachment.interface';

export class StorageUsageResDto {
  @ApiProperty({ description: 'Storage quota limit in bytes', example: 52428800 })
  quotaBytes!: number;

  @ApiProperty({ description: 'Total used storage in bytes', example: 1048576 })
  usedBytes!: number;

  @ApiProperty({ description: 'Remaining storage quota in bytes', example: 51380224 })
  remainingBytes!: number;

  @ApiProperty({ description: 'Percentage of storage quota consumed (0-100)', example: 2.0 })
  percentageUsed!: number;

  static fromData(input: StorageQuotaUsage): StorageUsageResDto {
    const res = new StorageUsageResDto();
    res.quotaBytes = Number(input.quotaBytes);
    res.usedBytes = Number(input.usedBytes);
    res.remainingBytes = Math.max(0, res.quotaBytes - res.usedBytes);
    res.percentageUsed =
      res.quotaBytes > 0
        ? Math.round((res.usedBytes / res.quotaBytes) * 1000) / 10
        : 0;
    return res;
  }
}
