import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../modules/realtime/realtime.module';
import { RealtimeController } from './realtime.controller';

@Module({
  imports: [RealtimeModule],
  controllers: [RealtimeController],
})
export class RealtimeRoutesModule {}
