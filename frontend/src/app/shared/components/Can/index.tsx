import React from "react"
import { usePermissions } from "@/app/api/queryHooks"

export interface CanProps {
  permission?: string
  permissions?: string[]
  roles?: string[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * Declarative component to block or show UI elements based on permissions or roles.
 */
export const Can: React.FC<CanProps> = ({
  permission,
  permissions,
  roles,
  children,
  fallback = null,
}) => {
  const { hasPermission, hasAnyPermission, hasRole } = usePermissions()

  if (permission && !hasPermission(permission)) {
    return <>{fallback}</>
  }

  if (permissions && !hasAnyPermission(permissions)) {
    return <>{fallback}</>
  }

  if (roles && !hasRole(...roles)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

export default Can

