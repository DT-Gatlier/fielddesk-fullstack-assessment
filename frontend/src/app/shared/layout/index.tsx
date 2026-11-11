import { NavLink, Outlet } from "react-router-dom"
import { useGetProfileDetails, useGetPermissions, useLogout } from "@/app/api/queryHooks"
import { useRealtimeUpdates } from "@/app/shared/hooks/useRealtimeUpdates"
import { ROUTE_CONFIG } from "@/app/router/config"
import { Can } from "@/app/shared/components/Can"
import { Button } from "@/app/shared/widgets/base/button"
import { StatusBadge } from "@/app/shared/widgets/custom/StatusBadge"
import {
  ShieldCheck,
  Building2,
  LogOut,
  UserCheck,
  LayoutDashboard,
  ClipboardList,
  ShieldAlert,
  Users,
  Layers,
  Key,
} from "lucide-react"

function Layout() {
  const { data: userInfo } = useGetProfileDetails()
  const { data: permsData } = useGetPermissions()
  const { mutate: logout, isPending: isLoggingOut } = useLogout()
  const user = userInfo?.user
  const { status: realtimeStatus } = useRealtimeUpdates(!!user)

  const permissions = permsData?.permissions || []

  if (!user) return null

  const renderRealtimeStatus = () => {
    if (realtimeStatus === "connected") {
      return (
        <div
          title="Live real-time sync active (SSE connected)"
          className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="hidden sm:inline">Live Sync Active</span>
        </div>
      )
    }

    if (realtimeStatus === "reconnecting") {
      return (
        <div
          title="Reconnecting to real-time event stream..."
          className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <span className="hidden sm:inline">Reconnecting...</span>
        </div>
      )
    }

    return null
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur transition-all">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-slate-900">FieldDesk</span>
            <span className="ml-2 text-xs font-medium text-slate-400">v1.0</span>
          </div>
        </div>

        {/* Right: Tenant Context Info & Actions */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
            <Building2 className="h-3.5 w-3.5 text-slate-500" />
            <span className="font-semibold text-slate-900">{user.organisationName || user.organisationId}</span>
          </div>

          {renderRealtimeStatus()}

          <StatusBadge status={user.role} />

          <div className="h-5 w-px bg-slate-200" />

          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-200">
              <UserCheck className="h-4 w-4" />
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-slate-900 leading-tight">{user.name}</div>
              <div className="text-[11px] text-slate-500 leading-tight">{user.email}</div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => logout()}
            disabled={isLoggingOut}
            className="text-slate-600 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 ml-2"
          >
            <LogOut className="h-3.5 w-3.5 mr-1.5" />
            <span>{isLoggingOut ? "Signing Out..." : "Sign Out"}</span>
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 gap-8">
        {/* Navigation Sidebar */}
        <aside className="w-64 shrink-0 hidden md:block space-y-6">
          <nav className="space-y-1 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Workspace
            </div>

            <NavLink
              to={ROUTE_CONFIG.dashboard.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Dashboard</span>
            </NavLink>

            <Can permission="work_orders:read">
              <NavLink
                to={ROUTE_CONFIG.workOrders.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`
                }
              >
                <ClipboardList className="h-4 w-4" />
                <span>Work Orders</span>
              </NavLink>
            </Can>

            <Can permissions={["team:read", "org:manage_settings"]}>
              <div className="px-3 pt-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Management
              </div>

              <Can permission="team:read">
                <NavLink
                  to={ROUTE_CONFIG.team.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? "bg-emerald-50 text-emerald-700 font-semibold"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`
                  }
                >
                  <Users className="h-4 w-4" />
                  <span>Technicians</span>
                </NavLink>
              </Can>

              <Can permission="org:manage_settings">
                <NavLink
                  to={ROUTE_CONFIG.settings.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? "bg-emerald-50 text-emerald-700 font-semibold"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`
                  }
                >
                  <Layers className="h-4 w-4" />
                  <span>Tenant Settings</span>
                </NavLink>
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
              Scoped strictly to <span className="font-semibold">{user.organisationName}</span> (
              <code className="font-mono text-[10px]">{user.organisationId}</code>).
            </p>
          </div>
        </aside>

        {/* Dynamic Route Content */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
