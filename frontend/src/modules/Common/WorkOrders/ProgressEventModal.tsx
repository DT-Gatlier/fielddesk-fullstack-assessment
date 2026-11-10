import { useState, useEffect } from "react"
import { useSubmitProgressEvent } from "./queryHooks"
import { Modal } from "@/app/shared/widgets/custom/Modal"
import { Button } from "@/app/shared/widgets/base/button"
import { Textarea } from "@/app/shared/widgets/base/textarea"
import {
  Activity,
  CheckCircle2,
  Loader2,
  Send,
  RotateCcw,
  Sparkles,
  Info,
} from "lucide-react"
import type {
  WorkOrder,
  WorkOrderStatus,
  ProgressEventType,
} from "./services/type"

interface ProgressEventModalProps {
  workOrder: WorkOrder | null
  isOpen: boolean
  onClose: () => void
}

function generateEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `evt-${crypto.randomUUID().slice(0, 8)}`
  }
  return `evt-${Math.random().toString(36).substring(2, 10)}`
}

export function ProgressEventModal({
  workOrder,
  isOpen,
  onClose,
}: ProgressEventModalProps) {
  const submitEventMutation = useSubmitProgressEvent()

  const [eventId, setEventId] = useState<string>("")
  const [eventType, setEventType] = useState<ProgressEventType>("status_changed")
  const [status, setStatus] = useState<WorkOrderStatus>("in_progress")
  const [note, setNote] = useState<string>("")
  const [lastSubmissionStatus, setLastSubmissionStatus] = useState<
    "idle" | "applied" | "duplicate_ignored"
  >("idle")

  // Generate new eventId whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setEventId(generateEventId())
      setLastSubmissionStatus("idle")
      if (workOrder) {
        if (workOrder.status === "open") {
          setStatus("in_progress")
        } else if (workOrder.status === "in_progress") {
          setStatus("completed")
        } else {
          setStatus(workOrder.status)
        }
      }
    }
  }, [isOpen, workOrder])

  const handleRegenerateId = () => {
    setEventId(generateEventId())
    setLastSubmissionStatus("idle")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workOrder || !eventId.trim()) return

    try {
      const res = await submitEventMutation.mutateAsync({
        workOrderId: workOrder.id,
        payload: {
          eventId: eventId.trim(),
          workOrderId: workOrder.id,
          type: eventType,
          occurredAt: new Date().toISOString(),
          payload: {
            status,
            note: note.trim() || undefined,
          },
        },
      })

      if (res.status === "applied") {
        setLastSubmissionStatus("applied")
        setTimeout(() => {
          onClose()
        }, 1200)
      } else if (res.status === "duplicate_ignored") {
        setLastSubmissionStatus("duplicate_ignored")
      }
    } catch {
      // Error handled by query hook toast
    }
  }

  if (!workOrder) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-600" />
          <span className="font-semibold text-slate-900">
            Field Progress Event — {workOrder.referenceNumber}
          </span>
        </div>
      }
      description="Record an idempotent mobile progress event with client-generated event tagging."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Idempotency Event Tag Banner */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Client Idempotency Key
            </span>
            <button
              type="button"
              onClick={handleRegenerateId}
              className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Regenerate Key</span>
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="font-mono text-xs font-semibold text-slate-800 bg-white px-2.5 py-1.5 rounded-lg border border-slate-300 w-full focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="e.g. evt-10001"
              required
            />
          </div>
          <p className="text-[11px] text-slate-500 leading-normal">
            Dual-store idempotency ensures that repeated mobile transmissions with the same{" "}
            <code className="font-mono text-slate-700 bg-slate-200/60 px-1 py-0.5 rounded">
              eventId
            </code>{" "}
            are safely deduplicated without duplicate side-effects.
          </p>
        </div>

        {/* Event Type & Target Status Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="event-type-select"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Event Action
            </label>
            <select
              id="event-type-select"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as ProgressEventType)}
              className="w-full text-xs rounded-lg border border-slate-300 py-2 px-3 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none shadow-xs"
            >
              <option value="status_changed">Status Transition</option>
              <option value="note_added">Field Observation Note</option>
              <option value="work_paused">Pause / Standby</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="target-status-select"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              New Status
            </label>
            <select
              id="target-status-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as WorkOrderStatus)}
              className="w-full text-xs rounded-lg border border-slate-300 py-2 px-3 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none shadow-xs"
            >
              <option value="in_progress">In Progress</option>
              <option value="blocked">Blocked</option>
              <option value="completed">Completed</option>
              <option value="open">Open</option>
            </select>
          </div>
        </div>

        {/* Progress Note */}
        <div>
          <label
            htmlFor="progress-note-textarea"
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Field Notes / Operational Context
          </label>
          <Textarea
            id="progress-note-textarea"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Describe current site progress, obstacles encountered, or parts replaced..."
            className="text-xs"
          />
        </div>

        {/* Idempotent Response Feedback (if tested in place) */}
        {lastSubmissionStatus === "applied" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Event Applied Successfully</p>
              <p className="text-[11px] text-emerald-700">
                Work order state updated to{" "}
                <span className="font-bold capitalize">{status.replace("_", " ")}</span> and
                immutable audit trail recorded.
              </p>
            </div>
          </div>
        )}

        {lastSubmissionStatus === "duplicate_ignored" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2.5 text-xs text-amber-800">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Duplicate Submission Safely Ignored</p>
              <p className="text-[11px] text-amber-700">
                Event ID <code className="font-mono font-bold">{eventId}</code> was already
                processed. The server responded with HTTP 200 without duplicate mutations.
              </p>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitEventMutation.isPending}
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            {/* Quick Test Button: Resend same event to demonstrate duplicate handling */}
            <Button
              type="submit"
              size="sm"
              variant="default"
              disabled={submitEventMutation.isPending || !eventId.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {submitEventMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  <span>Submitting Event...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  <span>Submit Progress Event</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
