import { useState, useEffect } from "react"
import {
  usePermissions,
  useGetProfileDetails,
} from "@/app/api/queryHooks"
import {
  useWorkOrderDetail,
  useUpdateWorkOrder,
  useTechnicians,
  useWorkOrderAttachments,
  useWorkOrderActivity,
} from "./queryHooks"
import { Button } from "@/app/shared/widgets/base/button"
import { StatusBadge } from "@/app/shared/widgets/custom/StatusBadge"
import { Modal } from "@/app/shared/widgets/custom/Modal"
import {
  Building2,
  Calendar,
  Clock,
  User,
  History,
  Loader2,
  CalendarPlus,
  Activity,
  Paperclip,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import type { WorkOrderStatus, WorkOrderPriority } from "./services/type"
import { AssignTechnicianModal } from "./AssignTechnicianModal"
import { ProgressEventModal } from "./ProgressEventModal"
import { AttachmentDropzone } from "./components/AttachmentDropzone"
import { AttachmentList } from "./components/AttachmentList"
import { QuotaProgressBar } from "./components/QuotaProgressBar"
import { ActivityTimeline } from "./components/ActivityTimeline"

interface WorkOrderDetailModalProps {
  workOrderId: string | null
  isOpen: boolean
  onClose: () => void
}

export function WorkOrderDetailModal({
  workOrderId,
  isOpen,
  onClose,
}: WorkOrderDetailModalProps) {
  const { data: wo, isLoading, isError } = useWorkOrderDetail(workOrderId)
  const { data: technicians = [] } = useTechnicians()
  const { hasPermission, role } = usePermissions()
  const { data: profile } = useGetProfileDetails()
  const { data: attachments = [], isLoading: isLoadingAttachments } =
    useWorkOrderAttachments(workOrderId)
  const { data: activities = [], isLoading: isLoadingActivity } =
    useWorkOrderActivity(workOrderId)
  const updateMutation = useUpdateWorkOrder()

  const [selectedStatus, setSelectedStatus] = useState<WorkOrderStatus>("open")
  const [selectedPriority, setSelectedPriority] = useState<WorkOrderPriority>("medium")
  const [selectedTechId, setSelectedTechId] = useState<string>("")
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false)

  const canEdit = hasPermission("work_orders:update") || hasPermission("work_orders:assign")
  const isTechnician = role.toLowerCase() === "technician"
  const currentUserId = profile?.user?.id
  const isAssignedTech = isTechnician && wo?.assignedTechnicianId === currentUserId
  const canSubmitProgress = isAssignedTech || !isTechnician

  const notificationSource = activities.length > 0 ? activities : wo?.auditLogs || []
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
          title={`Delivered via ${latestNotificationLog.metadata?.provider || "MockNotificationProvider"}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span>Notified</span>
        </span>
      )
    }

    if (latestNotificationLog?.action === "NOTIFICATION_ATTEMPT_FAILED") {
      const attempt = latestNotificationLog.metadata?.attempt || 1
      return (
        <span
          title={`Temporary failure: ${latestNotificationLog.metadata?.error || "503 Service Unavailable"}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
        >
          <Loader2 className="w-3 h-3 text-amber-600 animate-spin" />
          <span>Sending / Retrying (Attempt {attempt})</span>
        </span>
      )
    }

    if (latestNotificationLog?.action === "NOTIFICATION_PERMANENTLY_FAILED") {
      return (
        <span
          title={`Permanent failure: ${latestNotificationLog.metadata?.error || "400 Invalid Phone Format"}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200"
        >
          <AlertTriangle className="w-3 h-3 text-rose-600" />
          <span>Failed (Permanent)</span>
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-3 h-3 text-amber-600" />
        <span>Sending / Retrying (Attempt 1)</span>
      </span>
    )
  }

  useEffect(() => {
    if (wo) {
      setSelectedStatus(wo.status)
      setSelectedPriority(wo.priority)
      setSelectedTechId(wo.assignedTechnicianId || "")
    }
  }, [wo])

  const handleUpdate = () => {
    if (!wo) return

    const payload: {
      status?: WorkOrderStatus
      priority?: WorkOrderPriority
      assignedTechnicianId?: string | null
    } = {}

    if (selectedStatus !== wo.status) {
      payload.status = selectedStatus
    }

    if (!isTechnician) {
      if (selectedPriority !== wo.priority) {
        payload.priority = selectedPriority
      }
      if (selectedTechId !== (wo.assignedTechnicianId || "")) {
        payload.assignedTechnicianId = selectedTechId || null
      }
    }

    if (Object.keys(payload).length === 0) return

    updateMutation.mutate({
      id: wo.id,
      payload,
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

  return (
    <>
      <Modal
        isOpen={isOpen}
      onClose={onClose}
      title={
        wo ? (
          <div className="flex items-center justify-between gap-3 w-full pr-6">
            <div className="flex items-center gap-3">
              <span className="font-mono text-base font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                {wo.referenceNumber}
              </span>
              <StatusBadge status={wo.priority} />
              <StatusBadge status={wo.status} />
            </div>
            {canSubmitProgress && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsProgressModalOpen(true)}
                className="h-7 text-xs font-semibold border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-1.5"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-600" />
                <span>Update Progress</span>
              </Button>
            )}
          </div>
        ) : (
          "Work Order Details"
        )
      }
      size="xl"
    >
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-xs text-slate-500">Loading work order details...</p>
        </div>
      ) : isError || !wo ? (
        <div className="py-8 text-center text-sm text-rose-600">
          Work order not found or inaccessible in your organization context.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Header Info */}
          <div>
            <h2 className="text-xl font-bold text-slate-900">{wo.title}</h2>
            {wo.description ? (
              <p className="mt-2 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 p-3.5 rounded-lg border border-slate-100">
                {wo.description}
              </p>
            ) : (
              <p className="mt-1 text-xs italic text-slate-400">No additional description provided.</p>
            )}
          </div>

          {/* Key Attributes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/60 p-4 rounded-xl border border-slate-200">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Site Location</span>
              </span>
              <p className="text-sm font-semibold text-slate-800">{wo.siteName}</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>Assigned Technician</span>
                </span>
                <div className="flex items-center gap-2">
                  {renderNotificationBadge()}
                  {!isTechnician && (
                    <button
                      type="button"
                      onClick={() => setIsAssignModalOpen(true)}
                      className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1"
                    >
                      <CalendarPlus className="w-3 h-3" />
                      <span>{wo.assignedTechnician ? "Reschedule" : "Assign"}</span>
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm font-semibold text-slate-800">
                {wo.assignedTechnician ? (
                  <span>
                    {wo.assignedTechnician.name}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      ({wo.assignedTechnician.email})
                    </span>
                  </span>
                ) : (
                  <span className="text-amber-600 italic">Unassigned (In Dispatch Queue)</span>
                )}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Scheduled Window</span>
              </span>
              <p className="text-xs text-slate-700">
                {wo.scheduledStart ? (
                  <>
                    <strong className="text-slate-800">{formatDate(wo.scheduledStart)}</strong>
                    {" — "}
                    <strong className="text-slate-800">{formatDate(wo.scheduledEnd)}</strong>
                  </>
                ) : (
                  <span className="text-slate-400 italic">No scheduled window specified</span>
                )}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Created At</span>
              </span>
              <p className="text-xs text-slate-700">
                {formatDate(wo.createdAt)}{" "}
                {wo.creator && <span className="text-slate-500">by {wo.creator.name}</span>}
              </p>
            </div>
          </div>

          {/* Operational Update Controls (RBAC Guarded) */}
          {canEdit && (
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Manage Work Order Status
                </h4>
                {isTechnician && (
                  <span className="text-[11px] text-sky-600 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                    Technician Role: Status Progression Only
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="detail-status-select"
                    className="block text-[11px] font-semibold text-slate-500 mb-1"
                  >
                    Current Status
                  </label>
                  <select
                    id="detail-status-select"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value as WorkOrderStatus)}
                    className="w-full text-xs rounded-lg border border-slate-300 py-1.5 px-2.5 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {!isTechnician && (
                  <>
                    <div>
                      <label
                        htmlFor="detail-priority-select"
                        className="block text-[11px] font-semibold text-slate-500 mb-1"
                      >
                        Priority
                      </label>
                      <select
                        id="detail-priority-select"
                        value={selectedPriority}
                        onChange={(e) => setSelectedPriority(e.target.value as WorkOrderPriority)}
                        className="w-full text-xs rounded-lg border border-slate-300 py-1.5 px-2.5 focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="detail-tech-select"
                        className="block text-[11px] font-semibold text-slate-500 mb-1"
                      >
                        Assign Technician
                      </label>
                      <select
                        id="detail-tech-select"
                        value={selectedTechId}
                        onChange={(e) => setSelectedTechId(e.target.value)}
                        className="w-full text-xs rounded-lg border border-slate-300 py-1.5 px-2.5 focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Unassigned</option>
                        {technicians.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleUpdate}
                  disabled={
                    updateMutation.isPending ||
                    (selectedStatus === wo.status &&
                      selectedPriority === wo.priority &&
                      selectedTechId === (wo.assignedTechnicianId || ""))
                  }
                >
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Attachments & Documentation Section */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-slate-400" />
                <span>Attachments & Site Photos ({attachments.length})</span>
              </h4>
              <span className="text-[11px] text-slate-400 font-normal">
                JPEG, PNG, PDF (Max 10 MB)
              </span>
            </div>

            {/* Quota Usage Bar */}
            <QuotaProgressBar compact className="bg-slate-50/70 p-3 rounded-xl border border-slate-200" />

            {/* Upload Dropzone (Guarded: assigned tech or dispatcher/owner) */}
            {canSubmitProgress && (
              <AttachmentDropzone
                workOrderId={wo.id}
                disabled={isTechnician && !isAssignedTech}
              />
            )}

            {/* Attachment Items List */}
            <AttachmentList
              workOrderId={wo.id}
              attachments={attachments}
              isLoading={isLoadingAttachments}
            />
          </div>

          {/* Activity Timeline & Immutable Audit Trail */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <History className="w-4 h-4 text-slate-400" />
                <span>Activity Timeline &amp; Audit History</span>
              </h4>
              <span className="text-[11px] text-slate-400 font-normal">
                Immutable Append-Only Log
              </span>
            </div>

            <ActivityTimeline
              activities={activities}
              isLoading={isLoadingActivity}
            />
          </div>
        </div>
      )}
    </Modal>

    <AssignTechnicianModal
      workOrder={wo || null}
      isOpen={isAssignModalOpen}
      onClose={() => setIsAssignModalOpen(false)}
    />

    <ProgressEventModal
      workOrder={wo || null}
      isOpen={isProgressModalOpen}
      onClose={() => setIsProgressModalOpen(false)}
    />
  </>
  )
}
