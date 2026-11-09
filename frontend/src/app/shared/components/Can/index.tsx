import React from "react"
import { Navigate } from "react-router-dom"
import { usePermissions } from "@/app/api/queryHooks"
import { ROUTE_CONFIG } from "@/app/router/config"
import NotAuthorized from "@/app/shared/pages/NotAuthorized"
import LoadingOverlay from "@/app/shared/components/LoadingOverlay"

export interface CanProps {
  permission?: string
  permissions?: string[]
  roles?: string[]
  children: React.ReactNode
  fallback?: React.ReactNode
  showAccessDenied?: boolean
  redirectToNotAuthorized?: boolean
}

/**
 * Declarative component to block or show UI elements and views based on permissions or roles.
 *
 * Usage options:
 * 1. Inline element control (hides element by default):
 *    <Can permission="work_orders:create"><Button>Create</Button></Can>
 *
 * 2. Route/Page-level access control (shows 403 Access Denied page):
 *    <Can permission="team:read" showAccessDenied><TeamManagement /></Can>
 *
 * 3. Route/Page-level redirect (redirects to /not-authorized):
 *    <Can permission="team:read" redirectToNotAuthorized><TeamManagement /></Can>
 */
export const Can: React.FC<CanProps> = ({
  permission,
  permissions,
  roles,
  children,
  fallback = null,
  showAccessDenied = false,
  redirectToNotAuthorized = false,
}) => {
  const { hasPermission, hasAnyPermission, hasRole, isLoading } = usePermissions()

  if (isLoading) {
    if (showAccessDenied || redirectToNotAuthorized) {
      return <LoadingOverlay description="Checking your authorization..." />
    }
    return null
  }

  let isAllowed = true

  if (permission && !hasPermission(permission)) {
    isAllowed = false
  }

  if (permissions && !hasAnyPermission(permissions)) {
    isAllowed = false
  }

  if (roles && !hasRole(...roles)) {
    isAllowed = false
  }

  if (!isAllowed) {
    if (redirectToNotAuthorized) {
      return <Navigate to={ROUTE_CONFIG.notAuthorized.path} replace />
    }
    if (showAccessDenied) {
      return <NotAuthorized />
    }
    return <>{fallback}</>
  }

  return <>{children}</>
}

export default Can
