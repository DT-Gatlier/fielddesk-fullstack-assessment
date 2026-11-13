import { Link, useNavigate } from "react-router-dom"
import { useGetProfileDetails } from "@/app/api/queryHooks"
import { useDashboardMetrics } from "./queryHooks"
import { ROUTE_CONFIG } from "@/app/router/config"
import {
  ArrowRight,
  ClipboardList,
  Clock,
  PlayCircle,
  AlertCircle,
  CheckCircle2,
  Activity,
} from "lucide-react"

function Dashboard() {
  const navigate = useNavigate()
  const { data: userInfo } = useGetProfileDetails()
  const { data: metrics, isLoading: isMetricsLoading } = useDashboardMetrics()
  const user = userInfo?.user

  if (!user) return null

  const isTechnician = user.role.toLowerCase() === "technician"

  const metricCards = [
    {
      title: "Total Orders",
      count: metrics?.total ?? 0,
      status: "all",
      icon: ClipboardList,
      color: "text-slate-700 bg-slate-50 border-slate-200 hover:border-slate-400",
      iconColor: "text-slate-600 bg-slate-100",
    },
    {
      title: "Open",
      count: metrics?.open ?? 0,
      status: "open",
      icon: Clock,
      color: "text-sky-700 bg-sky-50/50 border-sky-200 hover:border-sky-400",
      iconColor: "text-sky-600 bg-sky-100",
    },
    {
      title: "In Progress",
      count: metrics?.in_progress ?? 0,
      status: "in_progress",
      icon: PlayCircle,
      color: "text-amber-700 bg-amber-50/50 border-amber-200 hover:border-amber-400",
      iconColor: "text-amber-600 bg-amber-100",
    },
    {
      title: "Blocked",
      count: metrics?.blocked ?? 0,
      status: "blocked",
      icon: AlertCircle,
      color: "text-rose-700 bg-rose-50/50 border-rose-200 hover:border-rose-400",
      iconColor: "text-rose-600 bg-rose-100",
    },
    {
      title: "Completed",
      count: metrics?.completed ?? 0,
      status: "completed",
      icon: CheckCircle2,
      color: "text-emerald-700 bg-emerald-50/50 border-emerald-200 hover:border-emerald-400",
      iconColor: "text-emerald-600 bg-emerald-100",
    },
  ]

  const handleCardClick = (status: string) => {
    if (status === "all") {
      void navigate(ROUTE_CONFIG.workOrders.path)
    } else {
      void navigate(`${ROUTE_CONFIG.workOrders.path}?status=${status}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900">Welcome, {user.name}</h2>
          <p className="text-sm text-slate-500">
            Organization: <strong className="text-slate-800">{user.organisationName}</strong>
          </p>
        </div>
      </div>

      {/* Work Order Real-Time Metrics */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-600" />
              <span>Work Order Operational Status</span>
            </h3>
            <p className="text-xs text-slate-500">
              {isTechnician
                ? "Metrics scoped strictly to your assigned work orders."
                : "Real-time dispatch metrics aggregated across all organization sites."}
            </p>
          </div>
          <Link
            to={ROUTE_CONFIG.workOrders.path}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition-colors"
          >
            <span>View All</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {metricCards.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.title}
                type="button"
                onClick={() => handleCardClick(card.status)}
                className={`group text-left p-4 rounded-xl border bg-white shadow-sm transition-all hover:shadow-md cursor-pointer ${card.color}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-500">{card.title}</span>
                  <div className={`p-1.5 rounded-lg ${card.iconColor}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="text-2xl font-extrabold text-slate-900 group-hover:scale-105 transition-transform origin-left">
                  {isMetricsLoading ? (
                    <span className="inline-block w-8 h-7 bg-slate-200 animate-pulse rounded" />
                  ) : (
                    card.count
                  )}
                </div>
                <div className="mt-1 flex items-center text-[11px] text-slate-400 group-hover:text-slate-600">
                  <span>Filter table</span>
                  <ArrowRight className="h-3 w-3 ml-1 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
