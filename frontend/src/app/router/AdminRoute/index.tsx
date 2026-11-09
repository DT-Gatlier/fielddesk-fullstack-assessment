import { Navigate } from "react-router-dom"
import { useGetProfileDetails } from "@/app/api/queryHooks"
import LoadingOverlay from "@/app/shared/components/LoadingOverlay"
import { ROUTE_CONFIG } from "../config"

interface AdminRouteProps {
  children: React.ReactNode
  allowedRoles?: string[]
}

function AdminRoute({ children, allowedRoles = ["owner"] }: AdminRouteProps) {
  const { data: userInfo, isLoading } = useGetProfileDetails()

  if (isLoading) {
    return <LoadingOverlay description="Checking your authorization..." />
  }

  const role = userInfo?.user?.role
  const isAllowed = role && allowedRoles.map((r) => r.toLowerCase()).includes(role.toLowerCase())

  if (!isAllowed) {
    return <Navigate to={ROUTE_CONFIG.notAuthorized.path} replace />
  }

  return <>{children}</>
}

export default AdminRoute

