import { Injectable } from '@nestjs/common';

import type { TenantContext } from '../../../common/interfaces/tenant-context.interface';
import { PrismaService } from '../../../database/prisma.service';
import type { OrganisationRepositoryPort } from '../interfaces/organisation-repository.interface';
import type {
  OrganisationSummary,
  UpdateOrganisationInput,
} from '../interfaces/organisation.interface';

const organisationSelect = { id: true, name: true } as const;

@Injectable()
export class OrganisationRepository implements OrganisationRepositoryPort {
  constructor(private readonly database: PrismaService) {}

  findCurrent(context: TenantContext): Promise<OrganisationSummary | null> {
    return this.database.client.organisation.findUnique({
      where: { id: context.organisationId },
      select: organisationSelect,
    });
  }

  async update(
    context: TenantContext,
    input: UpdateOrganisationInput,
  ): Promise<OrganisationSummary | null> {
    const existing = await this.database.client.organisation.findUnique({
      where: { id: context.organisationId },
      select: { id: true },
    });
    if (!existing) {
      return null;
    }

    return this.database.client.organisation.update({
      where: { id: context.organisationId },
      data: { name: input.name },
      select: organisationSelect,
    });
  }
}
