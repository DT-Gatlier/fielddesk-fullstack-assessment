import { ApiProperty } from '@nestjs/swagger';

import type { PaginatedWorkOrders } from '../../../modules/work-order/interfaces/work-order.interface';
import { WorkOrderResDto } from './work-order-res.dto';

export class WorkOrderListResDto {
  static fromData(input: PaginatedWorkOrders): WorkOrderListResDto {
    const result = new WorkOrderListResDto();
    result.items = input.items.map((wo) => WorkOrderResDto.fromData(wo));
    result.total = input.total;
    result.page = input.page;
    result.limit = input.limit;
    return result;
  }

  @ApiProperty({ type: [WorkOrderResDto] })
  items!: WorkOrderResDto[];

  @ApiProperty({ example: 10 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
