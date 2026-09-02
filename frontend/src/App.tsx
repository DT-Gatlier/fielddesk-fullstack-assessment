import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import WorkOrders from './pages/WorkOrders';
import OwnerDashboard from './pages/OwnerDashboard';
import { LogOut, LayoutDashboard, MapPin } from 'lucide-react';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const RoleRoute: React.FC<{ children: React.ReactNode, allowedRoles: string[] }> = ({ children, allowedRoles }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) {
    // If they try to access a route they shouldn't, send them to their designated home
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const SidebarItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  
  return (
    <Link to={to} className={cn(
      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all active:scale-[0.98]",
      isActive ? "bg-zinc-900 text-white shadow-md" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
    )}>
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  )
}

const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  
  return (
    <div className="flex h-screen w-full bg-zinc-50 overflow-hidden font-sans text-zinc-900">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-zinc-200 bg-white/50 backdrop-blur-xl">
        <div className="flex h-16 items-center px-6 border-b border-zinc-100">
          <div className="flex items-center gap-2 font-bold tracking-tight text-zinc-900">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-sm">
              <MapPin className="h-4 w-4" />
            </div>
            FieldDesk
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto px-3 py-6 flex flex-col gap-1">
          <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Main Menu</div>
          <SidebarItem to="/" icon={LayoutDashboard} label="Work Orders" />
        </div>
        
        <div className="border-t border-zinc-100 p-4">
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-zinc-200 shadow-sm">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-600">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-zinc-900">{user?.email}</p>
              <p className="truncate text-xs text-zinc-500 capitalize">{user?.role || 'User'}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-zinc-400 hover:text-zinc-900" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-zinc-50/50">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

const queryClient = new QueryClient();

const RoleRedirect = () => {
  const { user } = useAuth();
  
  if (user?.role === 'owner') return <Navigate to="/owner" replace />;
  if (user?.role === 'dispatcher') return <Navigate to="/dispatcher" replace />;
  if (user?.role === 'technician') return <Navigate to="/technician" replace />;
  
  // Tradeoff: If a user has an unknown role, we log them out instead of failing silently or guessing.
  return <Navigate to="/login" replace />;
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute>
                <RoleRedirect />
              </ProtectedRoute>
            } />
            <Route path="/owner" element={
              <RoleRoute allowedRoles={['owner']}>
                <DashboardLayout>
                  <OwnerDashboard />
                </DashboardLayout>
              </RoleRoute>
            } />
            <Route path="/dispatcher" element={
              <RoleRoute allowedRoles={['dispatcher', 'owner']}>
                <DashboardLayout>
                  <WorkOrders />
                </DashboardLayout>
              </RoleRoute>
            } />
            <Route path="/technician" element={
              <RoleRoute allowedRoles={['technician']}>
                <DashboardLayout>
                  <div className="p-8"><h1 className="text-2xl font-bold">Technician View</h1></div>
                </DashboardLayout>
              </RoleRoute>
            } />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
