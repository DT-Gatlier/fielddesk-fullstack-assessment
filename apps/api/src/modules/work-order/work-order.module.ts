import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { UserModule } from '../user/user.module';
import { NotificationModule } from '../notification/notification.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WORK_ORDER_REPOSITORY } from './interfaces/work-order-repository.interface';
import { WorkOrderRepository } from './repositories/work-order.repository';
import { WORK_ORDER_EVENT_REPOSITORY } from './interfaces/work-order-event.interface';
import { WorkOrderEventRepository } from './repositories/work-order-event.repository';
import { WorkOrderService } from './services/work-order.service';

@Module({
  imports: [DatabaseModule, UserModule, NotificationModule, RealtimeModule],
  providers: [
    { provide: WORK_ORDER_REPOSITORY, useClass: WorkOrderRepository },
    {
      provide: WORK_ORDER_EVENT_REPOSITORY,
      useClass: WorkOrderEventRepository,
    },
    WorkOrderService,
  ],
  exports: [WorkOrderService, WORK_ORDER_REPOSITORY],
})
export class WorkOrderModule {}
