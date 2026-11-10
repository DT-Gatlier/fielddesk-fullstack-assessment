import { Button } from "@/app/shared/widgets/base/button"
import { Modal } from "@/app/shared/widgets/custom/Modal"
import { CalendarX, Clock, ArrowRight } from "lucide-react"
import type { ConflictingWorkOrder } from "./services/type"

interface ConflictResolutionModalProps {
  isOpen: boolean
  onClose: () => void
  onKeepDraftAndReschedule: () => void
  conflictingWorkOrder?: ConflictingWorkOrder
  detailMessage?: string
  technicianName?: string
}

export function ConflictResolutionModal({
  isOpen,
  onClose,
  onKeepDraftAndReschedule,
  conflictingWorkOrder,
  detailMessage,
  technicianName = "The selected technician",
}: ConflictResolutionModalProps) {
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return "N/A"
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2 text-rose-600">
          <CalendarX className="h-5 w-5" />
          <span>Scheduling Conflict Detected</span>
        </div>
      }
      description="Concurrency conflict engine prevented overlapping technician bookings."
    >
      <div className="space-y-4">
        {/* Conflict Notice Banner */}
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 space-y-2">
          <p className="text-xs font-semibold text-rose-900 leading-relaxed">
            {detailMessage || `${technicianName} is already assigned to another active work order during this time slot.`}
          </p>
          <p className="text-[11px] text-rose-700 leading-relaxed">
            Another dispatcher may have just booked this technician, or the selected window overlaps with an existing task.
          </p>
        </div>

        {/* Conflicting Schedule Card */}
        {conflictingWorkOrder && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Existing Conflicting Assignment
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Order Reference:</span>
              <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                {conflictingWorkOrder.referenceNumber}
              </span>
            </div>
            <div className="flex items-start justify-between text-xs pt-1 border-t border-slate-200">
              <span className="text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Reserved Window:</span>
              </span>
              <div className="text-right font-medium text-slate-800">
                <div>{formatDateTime(conflictingWorkOrder.scheduledStart)}</div>
                <div className="text-[11px] text-slate-400">until {formatDateTime(conflictingWorkOrder.scheduledEnd)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            Cancel Assignment
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onKeepDraftAndReschedule}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
          >
            <span>Change Time Slot</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </div>
      </div>
    </Modal>
  )
}

