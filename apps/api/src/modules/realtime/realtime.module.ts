import { Module } from '@nestjs/common';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { RealtimeService } from './services/realtime.service';

@Module({
  imports: [RedisModule],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
