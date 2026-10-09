import type { TenantContext } from '../../../common/interfaces/tenant-context.interface';
import type {
  OrganisationSummary,
  UpdateOrganisationInput,
} from './organisation.interface';

export const ORGANISATION_REPOSITORY = Symbol('ORGANISATION_REPOSITORY');

export interface OrganisationRepositoryPort {
  findCurrent(context: TenantContext): Promise<OrganisationSummary | null>;
  update(
    context: TenantContext,
    input: UpdateOrganisationInput,
  ): Promise<OrganisationSummary | null>;
}
