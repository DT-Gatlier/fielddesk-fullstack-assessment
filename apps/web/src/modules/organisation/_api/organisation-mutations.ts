import { apiClient } from '@/api/client';
import { assertAuthEpoch, authEpoch, getCsrf } from '@/modules/auth/api/auth-transport';
import type { OrganisationResDto, UpdateOrganisationDto } from './api.types';

export async function updateOrganisation(input: UpdateOrganisationDto): Promise<OrganisationResDto> {
  const expected = authEpoch();
  const csrf = await getCsrf();
  const { data, error } = await apiClient().PATCH('/api/v1/organisation', {
    body: input,
    headers: { 'X-CSRF-Token': csrf },
  });
  assertAuthEpoch(expected);
  if (error || !data) {
    throw error || new Error('Failed to update organisation settings');
  }
  return data;
}
