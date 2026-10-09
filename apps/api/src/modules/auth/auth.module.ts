import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { AUTH_REPOSITORY } from './interfaces/auth-repository.interface';
import { AuthRepository } from './repositories/auth.repository';
import { AuthService } from './services/auth.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [
    { provide: AUTH_REPOSITORY, useClass: AuthRepository },
    AuthService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
