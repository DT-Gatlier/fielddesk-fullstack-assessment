
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import Layout from './components/layout/Layout';
import WorkOrderListPage from './pages/WorkOrderListPage';
import WorkOrderDetailPage from './pages/WorkOrderDetailPage';
import WorkOrderFormPage from './pages/WorkOrderFormPage';
import UserManagementPage from './pages/UserManagementPage';
import Loader from './components/ui/Loader';
import ToastContainer from './components/ui/ToastContainer';

// Initialize theme immediately to prevent flashing
const initialTheme = localStorage.getItem('fielddesk-theme');
if (initialTheme && initialTheme !== 'default') {
  document.documentElement.setAttribute('data-theme', initialTheme);
}

const ProtectedRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center' }}><Loader text="Authenticating..." /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout><Outlet /></Layout>;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/work-orders" element={<WorkOrderListPage />} />
          <Route path="/work-orders/new" element={<WorkOrderFormPage />} />
          <Route path="/work-orders/:id/edit" element={<WorkOrderFormPage />} />
          <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
          <Route path="/users" element={<UserManagementPage />} />
        </Route>
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}

export default App;
