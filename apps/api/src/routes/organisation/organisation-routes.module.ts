import { Module } from '@nestjs/common';

import { AttachmentModule } from '../../modules/attachment/attachment.module';
import { OrganisationModule } from '../../modules/organisation/organisation.module';
import { OrganisationController } from './organisation.controller';

@Module({
  imports: [OrganisationModule, AttachmentModule],
  controllers: [OrganisationController],
})
export class OrganisationRoutesModule {}
