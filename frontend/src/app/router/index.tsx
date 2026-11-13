import { lazy, Suspense } from "react"
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom"

import LoadingOverlay from "@/app/shared/components/LoadingOverlay"
import Layout from "@/app/shared/layout"
import ErrorBoundary from "@/app/shared/pages/ErrorBoundary"
import NotAuthorized from "@/app/shared/pages/NotAuthorized"
import NotFound from "@/app/shared/pages/NotFound"
import Login from "@/modules/Common/Login"

import AdminRoute from "./AdminRoute"
import { ROUTE_CONFIG } from "./config"
import ProtectedRoutes from "./ProtectedRoutes"

// Lazy loading the modules
const Dashboard = lazy(() => import("@/modules/Common/Dashboard"))
const WorkOrders = lazy(() => import("@/modules/Common/WorkOrders"))
const WorkOrderDetailPage = lazy(
  () => import("@/modules/Common/WorkOrders/WorkOrderDetailPage")
)
const TeamManagement = lazy(() => import("@/modules/admin/TeamManagement"))
const TenantSettings = lazy(() => import("@/modules/admin/TenantSettings"))

const router = createBrowserRouter([
  {
    id: ROUTE_CONFIG.login.id,
    path: ROUTE_CONFIG.login.path,
    element: <Login />,
  },
  {
    id: ROUTE_CONFIG.protectedScreens.id,
    path: ROUTE_CONFIG.protectedScreens.path,
    element: (
      <ProtectedRoutes>
        <Layout />
      </ProtectedRoutes>
    ),
    errorElement: <ErrorBoundary />,
    children: [
      {
        index: true,
        element: <Navigate to={ROUTE_CONFIG.dashboard.path} replace />,
      },
      {
        id: ROUTE_CONFIG.dashboard.id,
        path: ROUTE_CONFIG.dashboard.path,
        element: <Dashboard />,
      },
      {
        id: ROUTE_CONFIG.workOrders.id,
        path: ROUTE_CONFIG.workOrders.path,
        element: (
          <AdminRoute requiredPermission="work_orders:read">
            <WorkOrders />
          </AdminRoute>
        ),
      },
      {
        id: ROUTE_CONFIG.workOrderDetail.id,
        path: ROUTE_CONFIG.workOrderDetail.path,
        element: (
          <AdminRoute requiredPermission="work_orders:read">
            <WorkOrderDetailPage />
          </AdminRoute>
        ),
      },
      {
        id: ROUTE_CONFIG.team.id,
        path: ROUTE_CONFIG.team.path,
        element: (
          <AdminRoute allowedRoles={["owner", "dispatcher"]} requiredPermission="team:read">
            <TeamManagement />
          </AdminRoute>
        ),
      },
      {
        id: ROUTE_CONFIG.settings.id,
        path: ROUTE_CONFIG.settings.path,
        element: (
          <AdminRoute allowedRoles={["owner"]} requiredPermission="org:manage_settings">
            <TenantSettings />
          </AdminRoute>
        ),
      },
      {
        id: ROUTE_CONFIG.notAuthorized.id,
        path: ROUTE_CONFIG.notAuthorized.path,
        element: <NotAuthorized />,
      },
    ],
  },
  {
    id: ROUTE_CONFIG.notFound.id,
    path: ROUTE_CONFIG.notFound.path,
    element: <NotFound />,
  },
])

function AppRouter() {
  return (
    <Suspense
      fallback={<LoadingOverlay description="Loading module, please wait..." />}
    >
      <RouterProvider router={router} />
    </Suspense>
  )
}

export default AppRouter
