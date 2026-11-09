import React from 'react';
import { usePermissions } from '../hooks/usePermissions';
import { Permission, UserRole } from '../types/auth.types';

export interface CanProps {
  permission?: Permission;
  permissions?: Permission[];
  roles?: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Declarative component to block or show UI elements based on permissions or roles.
 *
 * Example:
 * <Can permission="work_orders:create">
 *   <Button>Create Work Order</Button>
 * </Can>
 */
export const Can: React.FC<CanProps> = ({
  permission,
  permissions,
  roles,
  children,
  fallback = null,
}) => {
  const { hasPermission, hasAnyPermission, hasRole } = usePermissions();

  if (permission && !hasPermission(permission)) {
    return <>{fallback}</>;
  }

  if (permissions && !hasAnyPermission(permissions)) {
    return <>{fallback}</>;
  }

  if (roles && !hasRole(...roles)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

