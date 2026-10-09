import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { HealthController } from './health.controller';
import { ReadinessService } from './services/readiness.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [HealthController],
  providers: [ReadinessService],
})
export class HealthRoutesModule {}
