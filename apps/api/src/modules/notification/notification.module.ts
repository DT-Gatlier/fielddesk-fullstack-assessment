import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MockNotificationProvider } from './providers/mock-notification.provider';
import { NotificationRepository } from './repositories/notification.repository';
import { InAppNotificationRepository } from './repositories/in-app-notification.repository';
import { NotificationService } from './services/notification.service';
import { InAppNotificationService } from './services/in-app-notification.service';

@Module({
  imports: [DatabaseModule, RealtimeModule],
  providers: [
    NotificationService,
    InAppNotificationService,
    {
      provide: 'NotificationRepositoryPort',
      useClass: NotificationRepository,
    },
    {
      provide: 'InAppNotificationRepositoryPort',
      useClass: InAppNotificationRepository,
    },
    {
      provide: 'NotificationProviderPort',
      useClass: MockNotificationProvider,
    },
  ],
  exports: [
    NotificationService,
    InAppNotificationService,
    'NotificationRepositoryPort',
    'InAppNotificationRepositoryPort',
  ],
})
export class NotificationModule {}
