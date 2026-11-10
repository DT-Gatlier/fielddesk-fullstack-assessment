import { useState, useRef, DragEvent, ChangeEvent } from "react"
import { useUploadAttachment } from "../queryHooks"
import { Button } from "@/app/shared/widgets/base/button"
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react"
import { formatBytes } from "./QuotaProgressBar"

interface AttachmentDropzoneProps {
  workOrderId: string
  onUploadSuccess?: () => void
  disabled?: boolean
}

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf"]
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export function AttachmentDropzone({
  workOrderId,
  onUploadSuccess,
  disabled = false,
}: AttachmentDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadMutation = useUploadAttachment()

  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [clientError, setClientError] = useState<string | null>(null)

  const validateFile = (file: File): boolean => {
    setClientError(null)

    // Check size <= 10MB
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setClientError(`File size (${formatBytes(file.size)}) exceeds the 10 MB limit.`)
      return false
    }

    // Check extension
    const nameLower = file.name.toLowerCase()
    const isAllowedExt = ALLOWED_EXTENSIONS.some((ext) => nameLower.endsWith(ext))
    if (!isAllowedExt) {
      setClientError("Unsupported format. Only JPEG (.jpg, .jpeg), PNG (.png), and PDF (.pdf) files are supported.")
      return false
    }

    return true
  }

  const handleFileSelection = (file: File) => {
    if (validateFile(file)) {
      setSelectedFile(file)
    } else {
      setSelectedFile(null)
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    if (disabled) return

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0])
    }
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!selectedFile || !workOrderId || disabled) return

    try {
      await uploadMutation.mutateAsync({
        workOrderId,
        file: selectedFile,
      })
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      onUploadSuccess?.()
    } catch {
      // Error handled by hook toast
    }
  }

  const handleClear = () => {
    setSelectedFile(null)
    setClientError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const isPdf = selectedFile?.name.toLowerCase().endsWith(".pdf")

  return (
    <div className="space-y-3">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled || uploadMutation.isPending}
      />

      {/* Drag & Drop Area */}
      {!selectedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
            disabled
              ? "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
              : isDragOver
              ? "border-emerald-500 bg-emerald-50/50 scale-[1.01]"
              : "border-slate-300 hover:border-emerald-500 hover:bg-slate-50/80 bg-white"
          }`}
        >
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="p-2.5 rounded-full bg-emerald-50 text-emerald-600">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">
                Click to browse or drag and drop files here
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Supports JPEG, PNG, and PDF (Max 10 MB per file)
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Selected File Card */
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-white border border-slate-200 text-slate-700 shrink-0">
              {isPdf ? (
                <FileText className="w-5 h-5 text-rose-500" />
              ) : (
                <ImageIcon className="w-5 h-5 text-sky-500" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">
                {selectedFile.name}
              </p>
              <p className="text-[11px] text-slate-500 font-mono">
                {formatBytes(selectedFile.size)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={uploadMutation.isPending}
              className="h-8 px-2 text-slate-500 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </Button>

            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleUpload}
              disabled={uploadMutation.isPending}
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <span>Upload File</span>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Client validation error */}
      {clientError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 flex items-start gap-2 text-xs text-rose-700">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{clientError}</span>
        </div>
      )}
    </div>
  )
}

