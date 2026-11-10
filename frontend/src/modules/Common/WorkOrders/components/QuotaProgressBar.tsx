import { useStorageQuota } from "../queryHooks"
import { HardDrive, AlertTriangle } from "lucide-react"

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 MB"
  const mb = bytes / (1024 * 1024)
  if (mb < 1000) {
    return `${mb.toFixed(1)} MB`
  }
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

interface QuotaProgressBarProps {
  compact?: boolean
  className?: string
}

export function QuotaProgressBar({ compact = false, className = "" }: QuotaProgressBarProps) {
  const { data: quota, isLoading } = useStorageQuota()

  if (isLoading || !quota) {
    return (
      <div className={`animate-pulse rounded-lg bg-slate-100 p-3 ${className}`}>
        <div className="h-3 bg-slate-200 rounded w-1/3 mb-2" />
        <div className="h-2 bg-slate-200 rounded w-full" />
      </div>
    )
  }

  const { usedBytes, quotaBytes, percentUsed } = quota
  const isNearLimit = percentUsed >= 90
  const isWarning = percentUsed >= 75 && percentUsed < 90

  const getBarColor = () => {
    if (isNearLimit) return "bg-rose-500"
    if (isWarning) return "bg-amber-500"
    return "bg-emerald-600"
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700 flex items-center gap-1.5">
          <HardDrive className="w-3.5 h-3.5 text-slate-500" />
          <span>Storage Quota</span>
        </span>
        <span className="font-mono text-slate-600">
          <strong>{formatBytes(usedBytes)}</strong> / {formatBytes(quotaBytes)}{" "}
          <span className="text-slate-400 font-normal">({percentUsed}%)</span>
        </span>
      </div>

      {/* Progress Track */}
      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getBarColor()}`}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        />
      </div>

      {/* Warning banner when >90% */}
      {isNearLimit && !compact && (
        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 flex items-start gap-2 text-xs text-rose-800">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Storage Quota Critical ({percentUsed}%)</p>
            <p className="text-[11px] text-rose-700">
              Your organisation has utilized over 90% of allocated storage limit. Uploads will be
              blocked when the quota is reached.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

