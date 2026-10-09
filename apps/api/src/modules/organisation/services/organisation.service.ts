import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { TenantContext } from '../../../common/interfaces/tenant-context.interface';
import { ORGANISATION_REPOSITORY } from '../interfaces/organisation-repository.interface';
import type { OrganisationRepositoryPort } from '../interfaces/organisation-repository.interface';
import type {
  OrganisationSummary,
  UpdateOrganisationInput,
} from '../interfaces/organisation.interface';

@Injectable()
export class OrganisationService {
  constructor(
    @Inject(ORGANISATION_REPOSITORY)
    private readonly repository: OrganisationRepositoryPort,
  ) {}

  async getCurrent(context: TenantContext): Promise<OrganisationSummary> {
    const organisation = await this.repository.findCurrent(context);
    if (!organisation) {
      throw new NotFoundException('Resource not found');
    }
    return organisation;
  }

  async updateCurrent(
    context: TenantContext,
    input: UpdateOrganisationInput,
  ): Promise<OrganisationSummary> {
    const updated = await this.repository.update(context, {
      name: input.name.trim(),
    });
    if (!updated) {
      throw new NotFoundException('Resource not found');
    }
    return updated;
  }
}
