import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { organisationKeys } from '../_api/organisation-keys';
import { fetchCurrentOrganisation } from '../_api/organisation-query';
import { updateOrganisation } from '../_api/organisation-mutations';
import type { UpdateOrganisationDto } from '../_api/api.types';
import { authKeys } from '@/modules/auth/api/auth-keys';

export function useCurrentOrganisation() {
  return useQuery({
    queryKey: organisationKeys.current(),
    queryFn: fetchCurrentOrganisation,
  });
}

export function useUpdateOrganisation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateOrganisationDto) => updateOrganisation(input),
    onSuccess: (data) => {
      queryClient.setQueryData(organisationKeys.current(), data);
      void queryClient.invalidateQueries({ queryKey: authKeys.session });
      toast.success('Organisation settings updated successfully');
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : 'Failed to update organisation settings';
      toast.error(message);
    },
  });
}
