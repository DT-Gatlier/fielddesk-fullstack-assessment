import { Navigate } from "react-router-dom"

import { useGetProfileDetails, useGetPermissions } from "@/app/api/queryHooks"
import { APP_USER_ROLES } from "@/app/shared/configs"

import LoadingOverlay from "@/app/shared/components/LoadingOverlay"
import { ROUTE_CONFIG } from "../config"

interface AdminRouteProps {
  children: React.ReactNode
  allowedRoles?: string[]
  requiredPermission?: string
  requiredPermissions?: string[]
}

function AdminRoute({
  children,
  allowedRoles,
  requiredPermission,
  requiredPermissions,
}: AdminRouteProps) {
  const { data: userInfo, isLoading: isProfileLoading } = useGetProfileDetails()
  const { data: permsData, isLoading: isPermsLoading } = useGetPermissions()

  if (isProfileLoading || isPermsLoading) {
    return <LoadingOverlay description="Checking your authorization" />
  }

  const role = userInfo?.user?.role?.toLowerCase()
  const permissions = permsData?.permissions || []

  // Check role restrictions if provided
  if (allowedRoles && allowedRoles.length > 0) {
    const isRoleAllowed = role && allowedRoles.map((r) => r.toLowerCase()).includes(role)
    if (!isRoleAllowed) {
      return <Navigate to={ROUTE_CONFIG.notAuthorized.path} replace />
    }
  }

  // Check single permission restriction if provided
  if (requiredPermission && !permissions.includes(requiredPermission)) {
    return <Navigate to={ROUTE_CONFIG.notAuthorized.path} replace />
  }

  // Check multiple permissions restriction if provided
  if (
    requiredPermissions &&
    requiredPermissions.length > 0 &&
    !requiredPermissions.some((p) => permissions.includes(p))
  ) {
    return <Navigate to={ROUTE_CONFIG.notAuthorized.path} replace />
  }

  // Default check if no parameters provided: only OWNER allowed
  if (!allowedRoles && !requiredPermission && !requiredPermissions) {
    const isOwner = role === APP_USER_ROLES.OWNER.toLowerCase()
    if (!isOwner) {
      return <Navigate to={ROUTE_CONFIG.notAuthorized.path} replace />
    }
  }

  return <>{children}</>
}

export default AdminRoute
