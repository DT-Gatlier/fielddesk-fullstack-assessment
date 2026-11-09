import { Navigate } from "react-router-dom"
import { useGetProfileDetails } from "@/app/api/queryHooks"
import LoadingOverlay from "@/app/shared/components/LoadingOverlay"
import { ROUTE_CONFIG } from "../config"

interface ProtectedRoutesProps {
  children: React.ReactNode
}

function ProtectedRoutes({ children }: ProtectedRoutesProps) {
  const { data: userInfo, isLoading } = useGetProfileDetails()

  // Show loading state while checking authentication status
  if (isLoading) {
    return <LoadingOverlay description="Checking your authentication..." />
  }

  // If user is not authenticated and trying to access protected routes, redirect to login page
  if (!userInfo?.user?.id) {
    return <Navigate to={ROUTE_CONFIG.login.path} replace />
  }

  return <>{children}</>
}

export default ProtectedRoutes

