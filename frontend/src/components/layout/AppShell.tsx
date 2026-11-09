import React from 'react';
import { Header } from './Header';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { usePermissions } from '../../features/auth/hooks/usePermissions';
import { Can } from '../../features/auth/components/Can';
import { LayoutDashboard, ClipboardList, ShieldAlert, Users, Layers, Key } from 'lucide-react';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { permissions } = usePermissions();

  if (!user) return <>{children}</>;

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

            <Can permission="work_orders:read">
              <a
                href="#work-orders"
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                <ClipboardList className="h-4 w-4 text-slate-400" />
                <span>Work Orders</span>
              </a>
            </Can>

            {/* Management Section: Protected by permissions */}
            <Can permissions={['team:read', 'org:manage_settings']}>
              <div className="px-3 pt-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Management
              </div>

              <Can permission="team:read">
                <a
                  href="#team"
                  className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <Users className="h-4 w-4 text-slate-400" />
                  <span>Technicians</span>
                </a>
              </Can>

              <Can permission="org:manage_settings">
                <a
                  href="#org-settings"
                  className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <Layers className="h-4 w-4 text-slate-400" />
                  <span>Tenant Settings</span>
                </a>
              </Can>
            </Can>
          </nav>

          {/* User's Server-Granted Permissions Overview */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs space-y-2 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Key className="h-3.5 w-3.5 text-emerald-600" />
              <span>Active Permissions ({permissions.length})</span>
            </div>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pt-1">
              {permissions.map((p) => (
                <span
                  key={p}
                  className="inline-block bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* Zero-Trust Isolation Status Pill */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-950 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-emerald-900">
              <ShieldAlert className="h-4 w-4 text-emerald-600" />
              <span>Multi-Tenant Guard Active</span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              Scoped strictly to <span className="font-semibold">{user.organisationName}</span> (<code className="font-mono text-[10px]">{user.organisationId}</code>).
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

