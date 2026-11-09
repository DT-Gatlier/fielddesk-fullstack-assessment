import { useGetProfileDetails, useGetPermissions } from "@/app/api/queryHooks"
import { Plus, Search, Filter } from "lucide-react"
import { Button } from "@/app/shared/widgets/base/button"
import { StatusBadge } from "@/app/shared/widgets/custom/StatusBadge"

function WorkOrders() {
  const { data: userInfo } = useGetProfileDetails()
  const { data: permsData } = useGetPermissions()

  const permissions = permsData?.permissions || []
  const canCreate = permissions.includes("work_orders:create")

  const sampleOrders = [
    {
      id: "WO-1001",
      title: "HVAC Compressor Overhaul",
      priority: "high",
      status: "in_progress",
      technician: "Alex Rivers",
      created: "2026-11-09",
    },
    {
      id: "WO-1002",
      title: "Quarterly Pump Calibration",
      priority: "medium",
      status: "pending",
      technician: "Unassigned",
      created: "2026-11-08",
    },
    {
      id: "WO-1003",
      title: "Electrical Panel Thermal Scan",
      priority: "low",
      status: "completed",
      technician: "Jordan Casey",
      created: "2026-11-07",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Work Orders</h1>
          <p className="text-sm text-slate-500">
            Tenant: <strong className="text-slate-700">{userInfo?.user?.organisationName}</strong> • Real-time dispatch and assignment
          </p>
        </div>

        {canCreate && (
          <Button variant="default">
            <Plus className="h-4 w-4 mr-1.5" />
            <span>Create Work Order</span>
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search work orders..."
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
              <Filter className="h-3.5 w-3.5" />
              <span>Filter</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Assigned To</th>
                <th className="py-3 px-4">Created Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sampleOrders.map((wo) => (
                <tr key={wo.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-semibold text-slate-900">{wo.id}</td>
                  <td className="py-3 px-4 font-medium text-slate-800">{wo.title}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={wo.priority} />
                  </td>
                  <td className="py-3 px-4">
                    <span className="capitalize">{wo.status.replace('_', ' ')}</span>
                  </td>
                  <td className="py-3 px-4">{wo.technician}</td>
                  <td className="py-3 px-4 text-slate-400">{wo.created}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default WorkOrders
