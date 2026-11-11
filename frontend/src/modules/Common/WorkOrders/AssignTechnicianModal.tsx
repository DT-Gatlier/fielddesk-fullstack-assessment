import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { useAssignTechnician, useTechnicians } from "./queryHooks"
import { Button } from "@/app/shared/widgets/base/button"
import { Input } from "@/app/shared/widgets/base/input"
import { Modal } from "@/app/shared/widgets/custom/Modal"
import { Loader2, UserCheck } from "lucide-react"
import type { AxiosError } from "axios"
import type {
  ConflictingWorkOrder,
  SchedulingConflictErrorResponse,
  WorkOrder,
} from "./services/type"

import { ConflictResolutionModal } from "./ConflictResolutionModal"

interface AssignTechnicianModalProps {
  workOrder: WorkOrder | null
  isOpen: boolean
  onClose: () => void
}

interface FormValues {
  technicianId: string
  scheduledStart: string
  scheduledEnd: string
}

export function AssignTechnicianModal({
  workOrder,
  isOpen,
  onClose,
}: AssignTechnicianModalProps) {
  const { data: technicians = [], isLoading: isTechLoading } = useTechnicians()
  const assignMutation = useAssignTechnician()

  const [conflictData, setConflictData] = useState<ConflictingWorkOrder | undefined>()
  const [conflictDetail, setConflictDetail] = useState<string>("")
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      technicianId: "",
      scheduledStart: "",
      scheduledEnd: "",
    },
  })

  // Format date helper for datetime-local input
  const toLocalIso = (dateStr?: string | null) => {
    if (!dateStr) return ""
    const d = new Date(dateStr)
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  // Populate initial values when modal opens
  useEffect(() => {
    if (workOrder && isOpen) {
      reset({
        technicianId: workOrder.assignedTechnicianId || "",
        scheduledStart: toLocalIso(workOrder.scheduledStart),
        scheduledEnd: toLocalIso(workOrder.scheduledEnd),
      })
      setFormError(null)
      setIsConflictModalOpen(false)
      setConflictData(undefined)
    }
  }, [workOrder, isOpen, reset])

  const selectedTechId = watch("technicianId")
  const selectedTech = technicians.find((t) => t.id === selectedTechId)

  const onSubmit = (values: FormValues) => {
    if (!workOrder) return
    setFormError(null)

    if (!values.technicianId) {
      setFormError("Please select a technician.")
      return
    }

    if (!values.scheduledStart || !values.scheduledEnd) {
      setFormError("Both start time and end time are required.")
      return
    }

    if (new Date(values.scheduledEnd) <= new Date(values.scheduledStart)) {
      setFormError("Scheduled end time must be after scheduled start time.")
      return
    }

    assignMutation.mutate(
      {
        id: workOrder.id,
        payload: {
          technicianId: values.technicianId,
          scheduledStart: new Date(values.scheduledStart).toISOString(),
          scheduledEnd: new Date(values.scheduledEnd).toISOString(),
        },
      },
      {
        onSuccess: () => {
          onClose()
        },
        onError: (err: AxiosError<SchedulingConflictErrorResponse>) => {
          if (err.response?.status === 409) {
            setConflictData(err.response.data?.conflictingWorkOrder)
            setConflictDetail(err.response.data?.detail || "Technician already scheduled during this window.")
            setIsConflictModalOpen(true)
          }
        },
      }
    )
  }

  return (
    <>
      <Modal
        isOpen={isOpen && !isConflictModalOpen}
        onClose={onClose}
        size="lg"
        title={
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-emerald-600" />
            <span>
              Schedule Technician:{" "}
              <span className="font-mono text-emerald-700">
                {workOrder?.referenceNumber}
              </span>
            </span>
          </div>
        }
        description="Assign a qualified technician and lock an isolated schedule window."
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {formError && (
            <div className="p-3 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {formError}
            </div>
          )}

          <div>
            <label
              htmlFor="technicianId"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Select Active Technician *
            </label>
            <select
              id="technicianId"
              disabled={isTechLoading}
              className="flex h-9 w-full rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              {...register("technicianId", { required: true })}
            >
              <option value="">-- Choose a Technician --</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.email})
                </option>
              ))}
            </select>
            {errors.technicianId && (
              <p className="mt-1 text-xs text-rose-600">Technician is required.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Scheduled Start *"
              type="datetime-local"
              error={errors.scheduledStart?.message}
              {...register("scheduledStart", { required: true })}
            />
            <Input
              label="Scheduled End *"
              type="datetime-local"
              error={errors.scheduledEnd?.message}
              {...register("scheduledEnd", { required: true })}
            />
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-500 space-y-1">
            <p className="font-medium text-slate-700">Schedule Protection</p>
            <p>
              Technician schedules are verified automatically to prevent overlapping appointments.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={assignMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={assignMutation.isPending}
            >
              {assignMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  <span>Saving Assignment...</span>
                </>
              ) : (
                <span>Confirm Assignment</span>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 409 Conflict Dialog (keeps draft safe) */}
      <ConflictResolutionModal
        isOpen={isConflictModalOpen}
        onClose={() => {
          setIsConflictModalOpen(false)
          onClose()
        }}
        onKeepDraftAndReschedule={() => {
          // Keep form draft intact and return to assign form
          setIsConflictModalOpen(false)
        }}
        conflictingWorkOrder={conflictData}
        detailMessage={conflictDetail}
        technicianName={selectedTech?.name}
      />
    </>
  )
}

