import { Button } from "@/app/shared/widgets/base/button"
import type { ConfirmationModalProps } from "./type"

export default function ConfirmationModal({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmButtonVariant = "default",
  confirmButtonText = "Confirm",
  cancelButtonText = "Cancel",
  onConfirm,
}: ConfirmationModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in-0 zoom-in-95">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {cancelButtonText}
          </Button>
          <Button
            variant={confirmButtonVariant}
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {confirmButtonText}
          </Button>
        </div>
      </div>
    </div>
  )
}

