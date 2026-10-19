import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout, Loading } from './components';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsersPage } from './pages/UsersPage';
import { WorkOrderDetailPage } from './pages/WorkOrderDetailPage';
import { WorkOrderFormPage } from './pages/WorkOrderFormPage';
import { WorkOrdersPage } from './pages/WorkOrdersPage';
import { RealtimeProvider } from './realtime';

export function App() {
  const { user, loading, can } = useAuth();
  if (loading) return <Loading what="Starting FieldDesk" />;
  if (!user) return <LoginPage />;

  return (
    <RealtimeProvider enabled>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="work-orders" element={<WorkOrdersPage />} />
          {can('owner', 'dispatcher') && <Route path="work-orders/new" element={<WorkOrderFormPage />} />}
          {can('owner', 'dispatcher') && <Route path="work-orders/:id/edit" element={<WorkOrderFormPage />} />}
          <Route path="work-orders/:id" element={<WorkOrderDetailPage />} />
          {can('owner') && <Route path="users" element={<UsersPage />} />}
          {can('owner', 'dispatcher') && <Route path="settings" element={<SettingsPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </RealtimeProvider>
  );
}
