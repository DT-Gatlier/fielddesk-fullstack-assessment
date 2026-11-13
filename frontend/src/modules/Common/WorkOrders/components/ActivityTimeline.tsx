import { useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  FilePlus2,
  History,
  Paperclip,
  RefreshCw,
  Trash2,
  UserCheck,
  XCircle,
} from "lucide-react"
import { Badge } from "@/app/shared/widgets/base/badge"
import { Button } from "@/app/shared/widgets/base/button"
import type { ActivityLogItem } from "../services/type"

interface ActivityTimelineProps {
  activities: ActivityLogItem[]
  isLoading?: boolean
}

function formatRelativeTime(dateInput: string): string {
  const date = new Date(dateInput)
  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (Number.isNaN(diffSeconds)) return dateInput
  if (diffSeconds < 60) return "Just now"

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) {
    return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatStatusLabel(status?: string): string {
  if (!status) return "Unknown"
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatScheduleWindow(start?: string | null, end?: string | null): string {
  if (!start || !end) return ""
  try {
    const startDt = new Date(start)
    const endDt = new Date(end)
    const fmt = (d: Date) =>
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    return `(${fmt(startDt)} - ${fmt(endDt)})`
  } catch {
    return ""
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getActionMeta(action: string) {
  switch (action) {
    case "WORK_ORDER_CREATED":
    case "work_order:created":
      return {
        icon: FilePlus2,
        bgClass: "bg-sky-50 border-sky-200 text-sky-600",
        label: "Created",
      }
    case "WORK_ORDER_ASSIGNED":
      return {
        icon: UserCheck,
        bgClass: "bg-indigo-50 border-indigo-200 text-indigo-600",
        label: "Assigned",
      }
    case "WORK_ORDER_STATUS_UPDATED":
    case "STATUS_CHANGED_VIA_EVENT":
      return {
        icon: RefreshCw,
        bgClass: "bg-amber-50 border-amber-200 text-amber-600",
        label: "Status Updated",
      }
    case "ATTACHMENT_UPLOADED":
    case "ATTACHMENT_ADDED":
      return {
        icon: Paperclip,
        bgClass: "bg-violet-50 border-violet-200 text-violet-600",
        label: "Attachment Added",
      }
    case "ATTACHMENT_DELETED":
      return {
        icon: Trash2,
        bgClass: "bg-rose-50 border-rose-200 text-rose-600",
        label: "Attachment Removed",
      }
    case "NOTIFICATION_DELIVERED":
      return {
        icon: CheckCircle2,
        bgClass: "bg-emerald-50 border-emerald-200 text-emerald-600",
        label: "Notification Sent",
      }
    case "NOTIFICATION_ATTEMPT_FAILED":
      return {
        icon: AlertTriangle,
        bgClass: "bg-amber-50 border-amber-200 text-amber-600",
        label: "Notification Retry",
      }
    case "NOTIFICATION_PERMANENTLY_FAILED":
      return {
        icon: XCircle,
        bgClass: "bg-rose-50 border-rose-200 text-rose-600",
        label: "Notification Failed",
      }
    default:
      return {
        icon: Edit3,
        bgClass: "bg-slate-100 border-slate-200 text-slate-600",
        label: "Updated",
      }
  }
}

function renderNarrative(item: ActivityLogItem): string {
  const actorName = item.actor?.name || "System Worker"
  const { action, beforeState, afterState, metadata } = item

  switch (action) {
    case "WORK_ORDER_CREATED":
    case "work_order:created": {
      const site = afterState?.siteName ? ` at ${afterState.siteName}` : ""
      return `${actorName} created work order${site}`
    }

    case "WORK_ORDER_ASSIGNED": {
      const techName =
        afterState?.assignedTechnicianName ||
        metadata?.technicianName ||
        "a technician"
      const windowStr = formatScheduleWindow(
        afterState?.scheduledStart || metadata?.scheduledStart,
        afterState?.scheduledEnd || metadata?.scheduledEnd
      )
      return `${actorName} assigned ${techName}${windowStr ? ` ${windowStr}` : ""}`
    }

    case "WORK_ORDER_STATUS_UPDATED":
    case "STATUS_CHANGED_VIA_EVENT": {
      const oldStatus = formatStatusLabel(beforeState?.status)
      const newStatus = formatStatusLabel(afterState?.status)
      if (beforeState?.status && afterState?.status && beforeState.status !== afterState.status) {
        return `${actorName} changed status from ${oldStatus} to ${newStatus}`
      }
      if (afterState?.status) {
        return `${actorName} recorded progress update (${newStatus})`
      }
      return `${actorName} logged a field progress event`
    }

    case "work_order:updated":
      return `${actorName} updated work order details`

    case "ATTACHMENT_UPLOADED":
    case "ATTACHMENT_ADDED": {
      const filename =
        afterState?.originalFilename || metadata?.originalFilename || "a file"
      const size = formatBytes(afterState?.fileSizeBytes || metadata?.fileSizeBytes)
      return `${actorName} attached ${filename}${size ? ` (${size})` : ""}`
    }

    case "ATTACHMENT_DELETED": {
      const filename =
        beforeState?.originalFilename || metadata?.originalFilename || "a file"
      return `${actorName} removed attachment ${filename}`
    }

    case "NOTIFICATION_DELIVERED":
      return `${actorName} delivered technician notification (Attempt ${metadata?.attempt ?? 1})`

    case "NOTIFICATION_ATTEMPT_FAILED":
      return `${actorName} notification attempt #${metadata?.attempt ?? 1} failed (${metadata?.error || "Transient error"})`

    case "NOTIFICATION_PERMANENTLY_FAILED":
      return `${actorName} notification permanently failed (${metadata?.error || "Unrecoverable error"})`

    default:
      return `${actorName} performed ${action}`
  }
}

export function ActivityTimeline({ activities, isLoading }: ActivityTimelineProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-7 h-7 rounded-full bg-slate-200 shrink-0" />
            <div className="flex-1 space-y-2 py-0.5">
              <div className="h-3.5 bg-slate-200 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center">
        <History className="w-6 h-6 text-slate-300 mb-1.5" />
        <p className="text-xs font-medium text-slate-600">No activity recorded yet</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          All status transitions, assignments, and uploads will appear chronologically.
        </p>
      </div>
    )
  }

  return (
    <div className="relative pl-1 max-h-80 overflow-y-auto pr-1">
      <div className="space-y-4">
        {activities.map((item, idx) => {
          const meta = getActionMeta(item.action)
          const IconComponent = meta.icon
          const isLast = idx === activities.length - 1
          const isExpanded = !!expandedIds[item.id]
          const hasDiff = Boolean(
            (item.beforeState && Object.keys(item.beforeState).length > 0) ||
              (item.afterState && Object.keys(item.afterState).length > 0)
          )
          const note = item.afterState?.note || item.metadata?.note

          return (
            <div key={item.id} className="relative flex gap-3">
              {/* Vertical connecting line */}
              {!isLast && (
                <div
                  className="absolute left-[13px] top-7 bottom-[-16px] w-px bg-slate-200"
                  aria-hidden="true"
                />
              )}

              {/* Action Icon Circle */}
              <div
                className={`relative z-10 w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${meta.bgClass}`}
              >
                <IconComponent className="w-3.5 h-3.5" />
              </div>

              {/* Event Content */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1">
                  <p className="text-xs font-medium text-slate-800 leading-snug">
                    {renderNarrative(item)}
                  </p>
                  <span
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 whitespace-nowrap shrink-0"
                    title={new Date(item.createdAt).toLocaleString()}
                  >
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>

                {/* Inline Status Diff Badge */}
                {(item.action === "WORK_ORDER_STATUS_UPDATED" ||
                  item.action === "STATUS_CHANGED_VIA_EVENT") &&
                  item.beforeState?.status &&
                  item.afterState?.status && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 px-1.5 font-medium bg-slate-50 text-slate-600 border-slate-200"
                      >
                        {formatStatusLabel(item.beforeState.status)}
                      </Badge>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 px-1.5 font-semibold bg-amber-50 text-amber-700 border-amber-200"
                      >
                        {formatStatusLabel(item.afterState.status)}
                      </Badge>
                    </div>
                  )}

                {/* Inline Technician Note Callout */}
                {note && (
                  <div className="mt-1.5 px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 italic">
                    &ldquo;{note}&rdquo;
                  </div>
                )}

                {/* Expandable State Diff Toggle */}
                {hasDiff && (
                  <div className="mt-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpand(item.id)}
                      className="h-5 px-1.5 text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded inline-flex items-center gap-1"
                    >
                      <span>{isExpanded ? "Hide Changes" : "View Changes"}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </Button>

                    {isExpanded && (
                      <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50/80 text-[11px] font-mono">
                        <div>
                          <div className="text-[10px] font-sans font-semibold uppercase tracking-wider text-rose-600 mb-1">
                            Before State
                          </div>
                          <pre className="whitespace-pre-wrap break-all text-slate-600 bg-white p-1.5 rounded border border-slate-200/70">
                            {item.beforeState
                              ? JSON.stringify(item.beforeState, null, 2)
                              : "null"}
                          </pre>
                        </div>
                        <div>
                          <div className="text-[10px] font-sans font-semibold uppercase tracking-wider text-emerald-600 mb-1">
                            After State
                          </div>
                          <pre className="whitespace-pre-wrap break-all text-slate-700 bg-white p-1.5 rounded border border-slate-200/70">
                            {item.afterState
                              ? JSON.stringify(item.afterState, null, 2)
                              : "null"}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

