import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import {
  useWorkOrders,
  useGetProfileDetails,
  useGetPermissions,
} from "@/app/api/queryHooks"
import { Button } from "@/app/shared/widgets/base/button"
import { StatusBadge } from "@/app/shared/widgets/custom/StatusBadge"
import {
  Plus,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  X,
  Loader2,
  CalendarPlus,
  Activity,
} from "lucide-react"

import { CreateWorkOrderModal } from "./CreateWorkOrderModal"
import { WorkOrderDetailModal } from "./WorkOrderDetailModal"
import { AssignTechnicianModal } from "./AssignTechnicianModal"
import { ProgressEventModal } from "./ProgressEventModal"
import type { WorkOrder } from "@/app/api/services/work-orders/type"

function WorkOrders() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: userInfo } = useGetProfileDetails()
  const { data: permsData } = useGetPermissions()

  const permissions = permsData?.permissions || []
  const canCreate = permissions.includes("work_orders:create")
  const canAssign = permissions.includes("work_orders:assign") || permissions.includes("work_orders:create")
  const isTechnician = userInfo?.user?.role?.toLowerCase() === "technician"

  // State from URL query parameters
  const initialStatus = searchParams.get("status") || "all"
  const initialPriority = searchParams.get("priority") || "all"
  const initialSearch = searchParams.get("search") || ""
  const initialPage = parseInt(searchParams.get("page") || "1", 10)

  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [priorityFilter, setPriorityFilter] = useState(initialPriority)
  const [searchInput, setSearchInput] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
  const [currentPage, setCurrentPage] = useState(initialPage)

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [assignTargetWo, setAssignTargetWo] = useState<WorkOrder | null>(null)
  const [progressTargetWo, setProgressTargetWo] = useState<WorkOrder | null>(null)

  // Sync URL params when internal state changes
  useEffect(() => {
    const params: Record<string, string> = {}
    if (statusFilter !== "all") params.status = statusFilter
    if (priorityFilter !== "all") params.priority = priorityFilter
    if (debouncedSearch) params.search = debouncedSearch
    if (currentPage > 1) params.page = String(currentPage)
    setSearchParams(params, { replace: true })
  }, [statusFilter, priorityFilter, debouncedSearch, currentPage, setSearchParams])

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // TanStack Query
  const { data, isLoading, isFetching } = useWorkOrders({
    page: currentPage,
    limit: 10,
    status: statusFilter,
    priority: priorityFilter,
    search: debouncedSearch,
  })

  const orders = data?.data || []
  const meta = data?.meta || {
    totalRecords: 0,
    totalPages: 1,
    currentPage: 1,
    limit: 10,
  }

  const handleClearFilters = () => {
    setStatusFilter("all")
    setPriorityFilter("all")
    setSearchInput("")
    setDebouncedSearch("")
    setCurrentPage(1)
  }

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—"
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Work Orders</h1>
            {isFetching && (
              <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
            )}
          </div>
          <p className="text-sm text-slate-500">
            Tenant: <strong className="text-slate-800">{userInfo?.user?.organisationName}</strong> • Multi-tenant role-isolated dispatch & tracking
          </p>
        </div>

        {canCreate && (
          <Button
            variant="default"
            onClick={() => setIsCreateOpen(true)}
            className="shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            <span>Create Work Order</span>
          </Button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-50/50">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search reference #, title, or site location..."
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <span>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="rounded-lg border border-slate-300 bg-white py-1 px-2.5 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>Priority:</span>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="rounded-lg border border-slate-300 bg-white py-1 px-2.5 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
              >
                <option value="all">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {(statusFilter !== "all" || priorityFilter !== "all" || debouncedSearch) && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2 ml-1"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Orders Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4">Title & Scope</th>
                <th className="py-3 px-4">Site Location</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Assigned Tech</th>
                <th className="py-3 px-4">Scheduled</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-24 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-48 bg-slate-200 rounded mb-1" />
                      <div className="h-3 w-32 bg-slate-100 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-28 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-5 w-16 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-5 w-20 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-24 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-20 bg-slate-200 rounded" />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="h-7 w-14 bg-slate-200 rounded ml-auto" />
                    </td>
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <ClipboardList className="w-10 h-10 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-700">No work orders found</p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        {debouncedSearch || statusFilter !== "all" || priorityFilter !== "all"
                          ? "Try adjusting your search criteria or resetting active filters."
                          : "No work orders have been created in this organisation yet."}
                      </p>
                      {(statusFilter !== "all" || priorityFilter !== "all" || debouncedSearch) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleClearFilters}
                          className="mt-2"
                        >
                          Clear Filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((wo: WorkOrder) => (
                  <tr
                    key={wo.id}
                    onClick={() => setSelectedOrderId(wo.id)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {wo.referenceNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors line-clamp-1">
                        {wo.title}
                      </div>
                      {wo.description && (
                        <div className="text-[11px] text-slate-400 line-clamp-1">
                          {wo.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700 whitespace-nowrap">
                      {wo.siteName}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusBadge status={wo.priority} />
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusBadge status={wo.status} />
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {wo.assignedTechnician ? (
                        <span className="font-medium text-slate-800">
                          {wo.assignedTechnician.name}
                        </span>
                      ) : (
                        <span className="text-amber-600 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-500">
                      {formatDate(wo.scheduledStart)}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {!wo.assignedTechnician && canAssign && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setAssignTargetWo(wo)
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors font-medium text-xs"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                            <span>Assign</span>
                          </button>
                        )}
                        {(isTechnician ? wo.assignedTechnicianId === userInfo?.user?.id : true) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setProgressTargetWo(wo)
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 transition-colors font-medium text-xs"
                            title="Submit Progress Event"
                          >
                            <Activity className="w-3.5 h-3.5" />
                            <span>Progress</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedOrderId(wo.id)
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 text-xs text-slate-500">
          <div>
            Showing{" "}
            <strong className="text-slate-800">
              {meta.totalRecords === 0 ? 0 : (meta.currentPage - 1) * meta.limit + 1}
            </strong>{" "}
            to{" "}
            <strong className="text-slate-800">
              {Math.min(meta.currentPage * meta.limit, meta.totalRecords)}
            </strong>{" "}
            of <strong className="text-slate-800">{meta.totalRecords}</strong> work orders
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={meta.currentPage <= 1 || isLoading}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              className="h-8 px-2.5 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              <span>Previous</span>
            </Button>

            <span className="px-2 text-xs font-semibold text-slate-700">
              Page {meta.currentPage} of {meta.totalPages || 1}
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={meta.currentPage >= meta.totalPages || isLoading}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, meta.totalPages))}
              className="h-8 px-2.5 text-xs"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Create Work Order Modal */}
      <CreateWorkOrderModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      {/* Work Order Detail Modal */}
      <WorkOrderDetailModal
        workOrderId={selectedOrderId}
        isOpen={!!selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />

      {/* Quick Assign Modal from Table Row */}
      <AssignTechnicianModal
        workOrder={assignTargetWo}
        isOpen={!!assignTargetWo}
        onClose={() => setAssignTargetWo(null)}
      />

      {/* Progress Event Modal from Table Row */}
      <ProgressEventModal
        workOrder={progressTargetWo}
        isOpen={!!progressTargetWo}
        onClose={() => setProgressTargetWo(null)}
      />
    </div>
  )
}

export default WorkOrders
