import React from 'react';
import { Header } from './Header';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { LayoutDashboard, ClipboardList, ShieldAlert, Users, Layers } from 'lucide-react';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  if (!user) return <>{children}</>;

  const isTechnician = user.role === 'technician';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header />

      <div className="flex-1 flex max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 gap-8">
        {/* Navigation Sidebar */}
        <aside className="w-64 shrink-0 hidden md:block space-y-6">
          <nav className="space-y-1 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Workspace
            </div>
            
            <a
              href="#dashboard"
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-50 text-emerald-700 font-semibold"
            >
              <LayoutDashboard className="h-4 w-4 text-emerald-600" />
              <span>Dashboard</span>
            </a>

            <a
              href="#work-orders"
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <ClipboardList className="h-4 w-4 text-slate-400" />
              <span>Work Orders</span>
            </a>

            {!isTechnician && (
              <>
                <div className="px-3 pt-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Management
                </div>
                <a
                  href="#team"
                  className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <Users className="h-4 w-4 text-slate-400" />
                  <span>Technicians</span>
                </a>
                <a
                  href="#org-settings"
                  className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <Layers className="h-4 w-4 text-slate-400" />
                  <span>Tenant Settings</span>
                </a>
              </>
            )}
          </nav>

          {/* Zero-Trust Isolation Status Pill */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-950 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-emerald-900">
              <ShieldAlert className="h-4 w-4 text-emerald-600" />
              <span>Multi-Tenant Guard Active</span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              Scoped strictly to <span className="font-semibold">{user.organisationName}</span> (<code className="font-mono text-[10px]">{user.organisationId}</code>). All queries are server-enforced.
            </p>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
};

