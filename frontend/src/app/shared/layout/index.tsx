import { useState, useEffect } from "react"
import { NavLink, Outlet, useLocation } from "react-router-dom"
import { useGetProfileDetails, useLogout } from "@/app/api/queryHooks"
import { useRealtimeUpdates } from "@/app/shared/hooks/useRealtimeUpdates"
import { ROUTE_CONFIG } from "@/app/router/config"
import { Can } from "@/app/shared/components/Can"
import { Button } from "@/app/shared/widgets/base/button"
import {
  ShieldCheck,
  Building2,
  LogOut,
  UserCheck,
  LayoutDashboard,
  ClipboardList,
  Users,
  Layers,
  Menu,
  X,
} from "lucide-react"

function Layout() {
  const location = useLocation()
  const { data: userInfo } = useGetProfileDetails()
  const { mutate: logout, isPending: isLoggingOut } = useLogout()
  const user = userInfo?.user
  useRealtimeUpdates(!!user)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Automatically close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [location.pathname])

  if (!user) return null

  const navLinks = (
    <>
      <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        Workspace
      </div>

      <NavLink
        to={ROUTE_CONFIG.dashboard.path}
        onClick={() => setIsMobileMenuOpen(false)}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            isActive
              ? "bg-emerald-50 text-emerald-700 font-semibold"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`
        }
      >
        <LayoutDashboard className="h-4 w-4 shrink-0" />
        <span>Dashboard</span>
      </NavLink>

      <Can permission="work_orders:read">
        <NavLink
          to={ROUTE_CONFIG.workOrders.path}
          onClick={() => setIsMobileMenuOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              isActive
                ? "bg-emerald-50 text-emerald-700 font-semibold"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`
          }
        >
          <ClipboardList className="h-4 w-4 shrink-0" />
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
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive
                  ? "bg-emerald-50 text-emerald-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`
            }
          >
            <Users className="h-4 w-4 shrink-0" />
            <span>Technicians</span>
          </NavLink>
        </Can>

        <Can permission="org:manage_settings">
          <NavLink
            to={ROUTE_CONFIG.settings.path}
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive
                  ? "bg-emerald-50 text-emerald-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`
            }
          >
            <Layers className="h-4 w-4 shrink-0" />
            <span>Organization Settings</span>
          </NavLink>
        </Can>
      </Can>
    </>
  )

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-3 sm:px-6 backdrop-blur transition-all">
        {/* Left: Mobile Toggle & Brand */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-slate-900">FieldDesk</span>
            <span className="ml-1.5 text-xs font-medium text-slate-400 hidden sm:inline">v1.0</span>
          </div>
        </div>

        {/* Right: Tenant Context Info & Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Organization Name Pill */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 max-w-[150px] md:max-w-xs truncate">
            <Building2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span className="font-semibold text-slate-900 truncate">
              {user.organisationName || user.organisationId}
            </span>
          </div>

          <div className="hidden sm:block h-5 w-px bg-slate-200" />

          {/* User Profile */}
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-200"
              title={user.name}
            >
              <UserCheck className="h-4 w-4" />
            </div>
            <div className="hidden md:block text-left max-w-[160px] truncate">
              <div className="text-xs font-semibold text-slate-900 leading-tight truncate">
                {user.name}
              </div>
              <div className="text-[10px] text-slate-500 leading-tight truncate">
                {user.email}
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => logout()}
            disabled={isLoggingOut}
            className="h-8 px-2 sm:px-2.5 text-xs text-slate-600 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
            title="Sign Out"
          >
            <LogOut className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{isLoggingOut ? "Signing Out..." : "Sign Out"}</span>
          </Button>
        </div>
      </header>

      {/* Mobile Drawer Backdrop & Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          <div className="fixed top-16 left-0 bottom-0 z-50 w-64 max-w-[80vw] bg-white border-r border-slate-200 p-4 shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-left duration-200">
            <nav className="space-y-1">{navLinks}</nav>

            <div className="pt-4 border-t border-slate-100 space-y-1 text-xs">
              <div className="font-semibold text-slate-800 truncate">{user.name}</div>
              <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 gap-8">
        {/* Desktop Navigation Sidebar */}
        <aside className="w-60 shrink-0 hidden md:block space-y-6">
          <nav className="space-y-1 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            {navLinks}
          </nav>
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
