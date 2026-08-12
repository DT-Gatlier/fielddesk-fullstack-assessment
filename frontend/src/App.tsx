import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LoadingState } from './components/Feedback';
import { useAuth } from './context/AuthContext';
import type { Role } from './types';

const AppLayout = lazy(() => import('./layouts/AppLayout'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const WorkOrderListPage = lazy(() => import('./pages/work-orders/WorkOrderListPage'));
const WorkOrderFormPage = lazy(() => import('./pages/work-orders/WorkOrderFormPage'));
const WorkOrderDetailPage = lazy(() => import('./pages/work-orders/WorkOrderDetailPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, booting } = useAuth(); const location = useLocation();
  if (booting) return <LoadingState label="Starting FieldDesk" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return <Suspense fallback={<LoadingState label="Loading page" />}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<Protected><AppLayout /></Protected>}>
      <Route index element={<DashboardPage />} />
      <Route path="work-orders" element={<WorkOrderListPage />} />
      <Route path="work-orders/new" element={<Protected roles={['owner', 'dispatcher']}><WorkOrderFormPage /></Protected>} />
      <Route path="work-orders/:id" element={<WorkOrderDetailPage />} />
      <Route path="work-orders/:id/edit" element={<Protected roles={['owner', 'dispatcher']}><WorkOrderFormPage /></Protected>} />
      <Route path="notifications" element={<Protected roles={['owner', 'dispatcher']}><NotificationsPage /></Protected>} />
      <Route path="team" element={<Protected roles={['owner', 'dispatcher']}><TeamPage /></Protected>} />
      <Route path="settings" element={<Protected roles={['owner']}><SettingsPage /></Protected>} />
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes></Suspense>;
}
