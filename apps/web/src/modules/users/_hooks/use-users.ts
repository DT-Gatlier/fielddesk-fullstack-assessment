'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/modules/auth/hooks/use-session';
import type { CreateUserDto, UpdateUserRoleDto } from '../_api/api.types';
import { createUser, updateUserRole } from '../_api/users-mutations';
import { getUsers } from '../_api/users-query';
import { usersKeys, type UsersListParams } from '../_api/users-keys';

export function useUsers(params: UsersListParams, options?: { enabled?: boolean }) {
  const { session } = useSession();
  const orgId = session.data?.organisation.id ?? '';
  const role = session.data?.role;
  const isAuthorizedRole = role === 'OWNER' || role === 'DISPATCHER';

  return useQuery({
    queryKey: usersKeys.list(orgId, params),
    queryFn: ({ signal }) => getUsers(params, signal),
    enabled: Boolean(orgId && isAuthorizedRole && (options?.enabled ?? true)),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateUserDto) => createUser(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: UpdateUserRoleDto }) =>
      updateUserRole(userId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.all });
    },
  });
}
