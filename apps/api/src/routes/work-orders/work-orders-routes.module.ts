import { Module } from '@nestjs/common';

import { AttachmentModule } from '../../modules/attachment/attachment.module';
import { WorkOrderModule } from '../../modules/work-order/work-order.module';
import { WorkOrdersController } from './work-orders.controller';

@Module({
  imports: [WorkOrderModule, AttachmentModule],
  controllers: [WorkOrdersController],
})
export class WorkOrdersRoutesModule {}
