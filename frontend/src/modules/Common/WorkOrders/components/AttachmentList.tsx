import { useState } from "react"
import { workOrderService } from "@/app/api/services/work-orders"
import { useDeleteAttachment, usePermissions } from "@/app/api/queryHooks"
import { Button } from "@/app/shared/widgets/base/button"
import {
  FileText,
  Image as ImageIcon,
  Download,
  Trash2,
  Loader2,
  Paperclip,
} from "lucide-react"
import type { WorkOrderAttachment } from "@/app/api/services/work-orders/type"
import { formatBytes } from "./QuotaProgressBar"
import { toast } from "sonner"

interface AttachmentListProps {
  workOrderId: string
  attachments: WorkOrderAttachment[]
  isLoading?: boolean
}

export function AttachmentList({
  workOrderId,
  attachments = [],
  isLoading = false,
}: AttachmentListProps) {
  const { hasRole } = usePermissions()
  const deleteMutation = useDeleteAttachment()
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const canDelete = hasRole("owner", "dispatcher")

  const handleDownload = async (att: WorkOrderAttachment) => {
    try {
      setDownloadingId(att.id)
      await workOrderService.downloadAttachment(att.id, att.originalFilename)
      toast.success(`Downloaded "${att.originalFilename}"`)
    } catch {
      toast.error("Failed to download attachment.")
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDelete = (attachmentId: string) => {
    if (confirm("Are you sure you want to delete this attachment? This will free up storage quota.")) {
      deleteMutation.mutate({
        attachmentId,
        workOrderId,
      })
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—"
    try {
      return new Date(dateStr).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    } catch {
      return dateStr
    }
  }

  if (isLoading) {
    return (
      <div className="py-6 flex flex-col items-center justify-center space-y-2 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
        <p className="text-xs">Loading attachments...</p>
      </div>
    )
  }

  if (attachments.length === 0) {
    return (
      <div className="py-6 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
        <Paperclip className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
        <p className="text-xs text-slate-500 font-medium">No attachments uploaded yet.</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Attach site inspection photos, equipment manuals, or completion reports.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {attachments.map((att) => {
        const isPdf = att.mimeType === "application/pdf"
        const isDownloading = downloadingId === att.id

        return (
          <div
            key={att.id}
            className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 shrink-0">
                {isPdf ? (
                  <FileText className="w-4 h-4 text-rose-500" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-sky-500" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate" title={att.originalFilename}>
                  {att.originalFilename}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                  <span>{formatBytes(att.fileSizeBytes)}</span>
                  <span>•</span>
                  <span>{formatDate(att.createdAt)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDownload(att)}
                disabled={isDownloading}
                className="h-8 px-2.5 text-xs text-slate-700 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50"
              >
                {isDownloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 mr-1" />
                    <span>Download</span>
                  </>
                )}
              </Button>

              {canDelete && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(att.id)}
                  disabled={deleteMutation.isPending}
                  className="h-8 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200"
                  title="Delete Attachment"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

