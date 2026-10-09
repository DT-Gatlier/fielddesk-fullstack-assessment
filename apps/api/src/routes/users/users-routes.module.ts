import { Module } from '@nestjs/common';

import { UserModule } from '../../modules/user/user.module';
import { UsersController } from './users.controller';

@Module({
  imports: [UserModule],
  controllers: [UsersController],
})
export class UsersRoutesModule {}
