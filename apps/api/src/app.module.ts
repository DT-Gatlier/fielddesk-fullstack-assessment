import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { resolve } from 'node:path';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { AuthGuard } from './http/guards/auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { NotificationModule } from './modules/notification/notification.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { UserModule } from './modules/user/user.module';
import { WorkOrderModule } from './modules/work-order/work-order.module';
import { AuthRoutesModule } from './routes/auth/auth-routes.module';
import { HealthRoutesModule } from './routes/health/health-routes.module';
import { OrganisationRoutesModule } from './routes/organisation/organisation-routes.module';
import { RealtimeRoutesModule } from './routes/realtime/realtime-routes.module';
import { UsersRoutesModule } from './routes/users/users-routes.module';
import { WorkOrdersRoutesModule } from './routes/work-orders/work-orders-routes.module';
import { NotificationsRoutesModule } from './routes/notifications/notifications-routes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      skipProcessEnv: true,
      envFilePath: resolve(__dirname, '../.env'),
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnvironment,
    }),
    DatabaseModule,
    AuthModule,
    UserModule,
    WorkOrderModule,
    NotificationModule,
    RealtimeModule,
    AuthRoutesModule,
    UsersRoutesModule,
    OrganisationRoutesModule,
    WorkOrdersRoutesModule,
    NotificationsRoutesModule,
    RealtimeRoutesModule,
    HealthRoutesModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
