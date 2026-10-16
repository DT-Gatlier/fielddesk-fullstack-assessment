import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ApiError } from './api/client';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { EmptyState, LoadingBlock } from './components/ui';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { TeamPage } from './pages/TeamPage';
import { WorkOrderDetailPage } from './pages/WorkOrderDetailPage';
import { WorkOrderFormPage } from './pages/WorkOrderFormPage';
import { WorkOrdersPage } from './pages/WorkOrdersPage';
import { RealtimeProvider } from './realtime';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        // Do not retry client errors (401/403/404/validation); retry transient ones briefly.
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center"><LoadingBlock label="Checking your session…" /></div>;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <RealtimeProvider>{children}</RealtimeProvider>;
}

/** Hides a route from roles that cannot use it. Cosmetic: the API enforces the same rule. */
function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useAuth();
  return can(permission) ? <>{children}</> : <EmptyState title="You don’t have access to this page" icon="alert" />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="work-orders" element={<WorkOrdersPage />} />
        <Route path="work-orders/new" element={<RequirePermission permission="workOrders:write"><WorkOrderFormPage /></RequirePermission>} />
        <Route path="work-orders/:id" element={<WorkOrderDetailPage />} />
        <Route path="work-orders/:id/edit" element={<RequirePermission permission="workOrders:write"><WorkOrderFormPage /></RequirePermission>} />
        <Route path="team" element={<RequirePermission permission="users:manage"><TeamPage /></RequirePermission>} />
        <Route path="*" element={<EmptyState title="Page not found" icon="search" />} />
      </Route>
    </Routes>
  );
}

export function App({ queryClient }: { queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </QueryClientProvider>
  );
}
