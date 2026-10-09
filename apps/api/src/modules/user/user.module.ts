import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { USER_REPOSITORY } from './interfaces/user-repository.interface';
import { UserRepository } from './repositories/user.repository';
import { UserService } from './services/user.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: USER_REPOSITORY, useClass: UserRepository },
    UserService,
  ],
  exports: [UserService],
})
export class UserModule {}
