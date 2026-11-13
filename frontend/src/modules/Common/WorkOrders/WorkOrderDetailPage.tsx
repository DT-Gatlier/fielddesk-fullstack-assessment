import { useState } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import {
  useWorkOrderDetail,
  useWorkOrderAttachments,
  useWorkOrderActivity,
  useUpdateWorkOrder,
} from "./queryHooks"
import { usePermissions, useGetProfileDetails } from "@/app/api/queryHooks"
import { ROUTE_CONFIG } from "@/app/router/config"
import { Button } from "@/app/shared/widgets/base/button"
import { StatusBadge } from "@/app/shared/widgets/custom/StatusBadge"
import { toast } from "sonner"
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Paperclip,
  History,
  Activity,
  CalendarPlus,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  AlertCircle,
  ChevronRight,
  Sparkles,
  MapPin,
  Flag,
} from "lucide-react"

import { AssignTechnicianModal } from "./AssignTechnicianModal"
import { ProgressEventModal } from "./ProgressEventModal"
import { AttachmentDropzone } from "./components/AttachmentDropzone"
import { AttachmentList } from "./components/AttachmentList"
import { ActivityTimeline } from "./components/ActivityTimeline"
import type { WorkOrderPriority } from "./services/type"

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: wo, isLoading, isError } = useWorkOrderDetail(id || null)
  const { hasPermission, role } = usePermissions()
  const { data: profile } = useGetProfileDetails()
  const { data: attachments = [], isLoading: isLoadingAttachments } =
    useWorkOrderAttachments(id || null)
  const { data: activities = [], isLoading: isLoadingActivity } =
    useWorkOrderActivity(id || null)
  const updateMutation = useUpdateWorkOrder()

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false)
  const [copiedRef, setCopiedRef] = useState(false)

  const canAssign = hasPermission("work_orders:assign") || hasPermission("work_orders:create")
  const canUpdate = hasPermission("work_orders:update")
  const isTechnician = role.toLowerCase() === "technician"
  const currentUserId = profile?.user?.id
  const isAssignedTech = isTechnician && wo?.assignedTechnicianId === currentUserId
  const canSubmitProgress = isAssignedTech || !isTechnician

  const handleCopyReference = () => {
    if (!wo?.referenceNumber) return
    navigator.clipboard.writeText(wo.referenceNumber)
    setCopiedRef(true)
    toast.success("Reference number copied to clipboard")
    setTimeout(() => setCopiedRef(false), 2000)
  }

  const handlePriorityChange = (newPriority: WorkOrderPriority) => {
    if (!wo || newPriority === wo.priority) return
    updateMutation.mutate({
      id: wo.id,
      payload: { priority: newPriority },
    })
  }

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "Not scheduled"
    try {
      return new Date(dateStr).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    } catch {
      return dateStr
    }
  }

  const getDurationString = (start?: string | null, end?: string | null) => {
    if (!start || !end) return null
    try {
      const diffMs = new Date(end).getTime() - new Date(start).getTime()
      if (diffMs <= 0) return null
      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60))
      const diffMins = Math.round((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      if (diffHrs === 0) return `${diffMins} min`
      if (diffMins === 0) return `${diffHrs} hr`
      return `${diffHrs} hr ${diffMins} min`
    } catch {
      return null
    }
  }

  const notificationSource =
    Array.isArray(activities) && activities.length > 0
      ? activities
      : Array.isArray(wo?.auditLogs)
      ? wo.auditLogs
      : []
  const latestNotificationLog = notificationSource.find(
    (log) =>
      log.action === "NOTIFICATION_DELIVERED" ||
      log.action === "NOTIFICATION_ATTEMPT_FAILED" ||
      log.action === "NOTIFICATION_PERMANENTLY_FAILED"
  )

  const renderNotificationBadge = () => {
    if (!wo?.assignedTechnician) return null

    if (latestNotificationLog?.action === "NOTIFICATION_DELIVERED") {
      return (
        <span
          title={`Delivered via ${latestNotificationLog.metadata?.provider || "NotificationProvider"}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Dispatch Notified</span>
        </span>
      )
    }

    if (latestNotificationLog?.action === "NOTIFICATION_ATTEMPT_FAILED") {
      const attempt = latestNotificationLog.metadata?.attempt || 1
      return (
        <span
          title={`Temporary failure: ${latestNotificationLog.metadata?.error || "503 Service Unavailable"}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200"
        >
          <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
          <span>Notifying (Attempt {attempt})...</span>
        </span>
      )
    }

    if (latestNotificationLog?.action === "NOTIFICATION_PERMANENTLY_FAILED") {
      return (
        <span
          title={`Permanent failure: ${latestNotificationLog.metadata?.error || "400 Invalid Phone Format"}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          <span>Dispatch Notice Failed</span>
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
        <Clock className="w-3.5 h-3.5 text-slate-500" />
        <span>Dispatch Queued</span>
      </span>
    )
  }

  // Modern lifecycle progress pipeline
  const renderLifecycleStepper = () => {
    if (!wo) return null

    if (wo.status === "cancelled") {
      return (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-100 border border-slate-200 text-slate-700">
          <AlertCircle className="w-5 h-5 text-slate-500 shrink-0" />
          <div className="text-xs">
            <span className="font-semibold text-slate-900">Work Order Cancelled</span> — Work on this order was stopped and is archived.
          </div>
        </div>
      )
    }

    if (wo.status === "blocked") {
      return (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <div className="text-xs">
            <span className="font-semibold text-rose-900">Work Order Blocked</span> — A blocker has been reported on site. Log a progress event to clear or update the issue.
          </div>
        </div>
      )
    }

    const steps = [
      {
        key: "open",
        label: "Open / Dispatched",
        isComplete: ["in_progress", "completed"].includes(wo.status),
        isCurrent: wo.status === "open",
      },
      {
        key: "in_progress",
        label: "In Progress",
        isComplete: wo.status === "completed",
        isCurrent: wo.status === "in_progress",
      },
      {
        key: "completed",
        label: "Completed",
        isComplete: wo.status === "completed",
        isCurrent: wo.status === "completed",
      },
    ]

    return (
      <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
        <div className="flex items-center justify-between relative px-2 sm:px-6">
          <div className="absolute top-1/2 left-8 right-8 h-0.5 bg-slate-200 -translate-y-1/2 z-0" />
          {steps.map((step, idx) => {
            const isCompleted = step.isComplete
            const isCurrent = step.isCurrent

            return (
              <div key={step.key} className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all shadow-xs ${
                    isCompleted
                      ? "bg-emerald-600 text-white ring-4 ring-emerald-50"
                      : isCurrent
                      ? "bg-white text-emerald-700 border-2 border-emerald-600 ring-4 ring-emerald-100/70"
                      : "bg-white text-slate-400 border-2 border-slate-200"
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : idx + 1}
                </div>
                <span
                  className={`mt-2 text-xs font-semibold whitespace-nowrap ${
                    isCurrent ? "text-emerald-800" : isCompleted ? "text-slate-800" : "text-slate-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-9 h-9 animate-spin text-emerald-600" />
        <p className="text-sm font-medium text-slate-600">Loading work order details...</p>
      </div>
    )
  }

  if (isError || !wo) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="inline-flex p-3 rounded-full bg-rose-50 text-rose-600 ring-8 ring-rose-50/50">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Work Order Not Found</h2>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          This order does not exist or is not accessible in your organization workspace.
        </p>
        <div className="pt-2">
          <Button
            variant="default"
            onClick={() => navigate(ROUTE_CONFIG.workOrders.path)}
            className="inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Work Orders</span>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link
            to={ROUTE_CONFIG.workOrders.path}
            className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-emerald-700 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Work Orders</span>
          </Link>
          <ChevronRight className="w-3 h-3 text-slate-400" />
          <span className="font-mono font-semibold text-slate-800">{wo.referenceNumber}</span>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2.5">
          {canSubmitProgress && (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setIsProgressModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Activity className="w-4 h-4" />
              <span>Update Progress</span>
            </Button>
          )}

          {!isTechnician && canAssign && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAssignModalOpen(true)}
              className="border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 font-semibold"
            >
              <CalendarPlus className="w-4 h-4 text-slate-500" />
              <span>{wo.assignedTechnician ? "Reschedule" : "Assign Technician"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Hero Header Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleCopyReference}
                title="Click to copy reference number"
                className="font-mono text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-md border border-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>{wo.referenceNumber}</span>
                {copiedRef ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                )}
              </button>
              <StatusBadge status={wo.priority} />
              <StatusBadge status={wo.status} />
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 leading-snug">
              {wo.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-0.5">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{wo.siteName}</span>
              </span>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  Created {formatDate(wo.createdAt)}
                  {wo.creator && (
                    <span className="text-slate-600 font-medium"> by {wo.creator.name}</span>
                  )}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Lifecycle Stepper */}
        {renderLifecycleStepper()}
      </div>

      {/* 2-Column Balanced Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column (Primary Scope & Attachments) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Scope of Work & Priority Adjuster */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>Scope of Work & Requirements</span>
              </h2>

              {/* Priority Quick-Switcher for Dispatcher/Owner */}
              {!isTechnician && canUpdate && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Flag className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-400 font-medium">Priority:</span>
                  <select
                    value={wo.priority}
                    onChange={(e) => handlePriorityChange(e.target.value as WorkOrderPriority)}
                    disabled={updateMutation.isPending}
                    className="text-xs font-semibold rounded-md border border-slate-200 bg-slate-50 py-1 px-2 text-slate-700 hover:bg-slate-100 cursor-pointer focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              )}
            </div>

            {wo.description ? (
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50/80 p-4 rounded-xl border border-slate-100">
                {wo.description}
              </p>
            ) : (
              <p className="text-xs italic text-slate-400 bg-slate-50/60 p-4 rounded-xl border border-dashed border-slate-200">
                No supplementary scope notes provided for this work order.
              </p>
            )}
          </div>

          {/* Attachments & Documentation Section */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-emerald-600" />
                <span>Attachments &amp; Site Evidence ({attachments.length})</span>
              </h2>
              <span className="text-xs text-slate-400">PDF, PNG, JPEG up to 10 MB</span>
            </div>

            {/* Upload Dropzone */}
            {canSubmitProgress && (
              <AttachmentDropzone
                workOrderId={wo.id}
                disabled={isTechnician && !isAssignedTech}
              />
            )}

            {/* Uploaded File List */}
            <AttachmentList
              workOrderId={wo.id}
              attachments={attachments}
              isLoading={isLoadingAttachments}
            />
          </div>
        </div>

        {/* Right Column (Sidebar: Technician, Schedule & Audit Trail) */}
        <div className="space-y-6">
          {/* Assigned Technician Card */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span>Assigned Technician</span>
              </h3>

              {!isTechnician && canAssign && wo.assignedTechnician && (
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(true)}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  Change
                </button>
              )}
            </div>

            {wo.assignedTechnician ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0">
                    {wo.assignedTechnician.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {wo.assignedTechnician.name}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {wo.assignedTechnician.email}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-400">Dispatch Status</span>
                  {renderNotificationBadge()}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-800 space-y-2.5">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Unassigned in Dispatch Queue</span>
                </div>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  No technician has been dispatched to this job yet.
                </p>
                {!isTechnician && canAssign && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsAssignModalOpen(true)}
                    className="w-full h-8 text-xs font-semibold bg-white border-amber-300 text-amber-900 hover:bg-amber-100"
                  >
                    Assign Technician
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Schedule Window Card */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Scheduled Window</span>
            </h3>

            {wo.scheduledStart ? (
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-slate-400">Starts:</span>
                  <span className="font-semibold text-slate-900">{formatDate(wo.scheduledStart)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-slate-400">Ends:</span>
                  <span className="font-semibold text-slate-900">{formatDate(wo.scheduledEnd)}</span>
                </div>
                {getDurationString(wo.scheduledStart, wo.scheduledEnd) && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-slate-400">Duration:</span>
                    <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      {getDurationString(wo.scheduledStart, wo.scheduledEnd)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs italic text-slate-400 py-1">
                No operational time window scheduled.
              </p>
            )}
          </div>

          {/* Activity Timeline Card */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-500" />
                <span>Live Audit Trail</span>
              </h3>
              <span className="text-xs text-slate-400 font-medium">
                {activities.length} {activities.length === 1 ? "event" : "events"}
              </span>
            </div>

            <ActivityTimeline
              activities={activities}
              isLoading={isLoadingActivity}
            />
          </div>
        </div>
      </div>

      {/* Assignment & Scheduling Modal */}
      {!isTechnician && (
        <AssignTechnicianModal
          workOrder={wo || null}
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
        />
      )}

      {/* Progress Event Submission Modal */}
      <ProgressEventModal
        workOrder={wo || null}
        isOpen={isProgressModalOpen}
        onClose={() => setIsProgressModalOpen(false)}
      />
    </div>
  )
}
