import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { getPermissionsApi } from '../api/auth.api';
import { Permission, UserRole } from '../types/auth.types';

export function usePermissions() {
  const { user } = useAuth();

  // Fetch permissions independently from the dedicated /permissions API
  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'permissions', user?.id],
    queryFn: getPermissionsApi,
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  const permissions = (data?.permissions as Permission[]) || [];

  const hasPermission = (permission: Permission): boolean => {
    return permissions.includes(permission);
  };

  const hasAnyPermission = (perms: Permission[]): boolean => {
    return perms.some((p) => permissions.includes(p));
  };

  const hasRole = (...roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return {
    permissions,
    role: user?.role,
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasRole,
    isOwner: user?.role === 'owner',
    isDispatcher: user?.role === 'dispatcher',
    isTechnician: user?.role === 'technician',
  };
}
