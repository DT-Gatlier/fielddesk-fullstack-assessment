import { apiClient } from '@/api/client';
import { assertAuthEpoch, authEpoch } from '@/modules/auth/api/auth-transport';
import type { OrganisationResDto } from './api.types';

export async function fetchCurrentOrganisation(): Promise<OrganisationResDto> {
  const expected = authEpoch();
  const { data, error } = await apiClient().GET('/api/v1/organisation');
  assertAuthEpoch(expected);
  if (error || !data) {
    throw error || new Error('Failed to fetch organisation details');
  }
  return data;
}
