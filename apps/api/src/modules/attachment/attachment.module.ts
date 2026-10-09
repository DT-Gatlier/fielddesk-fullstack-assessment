import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WorkOrderModule } from '../work-order/work-order.module';
import { ATTACHMENT_REPOSITORY } from './interfaces/attachment.interface';
import { AttachmentRepository } from './repositories/attachment.repository';
import { AttachmentService } from './services/attachment.service';

@Module({
  imports: [DatabaseModule, StorageModule, WorkOrderModule, RealtimeModule],
  providers: [
    {
      provide: ATTACHMENT_REPOSITORY,
      useClass: AttachmentRepository,
    },
    AttachmentService,
  ],
  exports: [AttachmentService],
})
export class AttachmentModule {}
