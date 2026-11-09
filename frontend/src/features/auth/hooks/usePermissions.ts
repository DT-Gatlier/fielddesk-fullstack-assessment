import { useAuth } from './useAuth';
import { Permission, UserRole } from '../types/auth.types';

export function usePermissions() {
  const { user } = useAuth();

  const hasPermission = (permission: Permission): boolean => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes(permission);
  };

  const hasAnyPermission = (permissions: Permission[]): boolean => {
    if (!user || !user.permissions) return false;
    return permissions.some((p) => user.permissions?.includes(p));
  };

  const hasRole = (...roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return {
    permissions: user?.permissions || [],
    role: user?.role,
    hasPermission,
    hasAnyPermission,
    hasRole,
    isOwner: user?.role === 'owner',
    isDispatcher: user?.role === 'dispatcher',
    isTechnician: user?.role === 'technician',
  };
}

