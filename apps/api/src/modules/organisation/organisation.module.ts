import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { ORGANISATION_REPOSITORY } from './interfaces/organisation-repository.interface';
import { OrganisationRepository } from './repositories/organisation.repository';
import { OrganisationService } from './services/organisation.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: ORGANISATION_REPOSITORY, useClass: OrganisationRepository },
    OrganisationService,
  ],
  exports: [OrganisationService],
})
export class OrganisationModule {}
