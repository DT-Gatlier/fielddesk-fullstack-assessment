import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useCreateWorkOrder, useTechnicians } from "./queryHooks"
import { Button } from "@/app/shared/widgets/base/button"
import { Input } from "@/app/shared/widgets/base/input"
import { Textarea } from "@/app/shared/widgets/base/textarea"
import { DateTimePicker } from "@/app/shared/widgets/custom/DateTimePicker"
import { Modal } from "@/app/shared/widgets/custom/Modal"
import { Loader2 } from "lucide-react"

import { createWorkOrderSchema, type CreateWorkOrderFormData } from "./schema"

interface CreateWorkOrderModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateWorkOrderModal({ isOpen, onClose }: CreateWorkOrderModalProps) {
  const { data: technicians = [], isLoading: isTechLoading } = useTechnicians(isOpen)
  const createMutation = useCreateWorkOrder()

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateWorkOrderFormData>({
    resolver: zodResolver(createWorkOrderSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      siteName: "",
      assignedTechnicianId: "",
      scheduledStart: "",
      scheduledEnd: "",
    },
  })

  const toIsoOrNull = (val?: string | null) => {
    if (!val || typeof val !== "string" || !val.trim()) return null
    const d = new Date(val)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }

  const onSubmit = (data: CreateWorkOrderFormData) => {
    const assignedTechId =
      data.assignedTechnicianId && data.assignedTechnicianId.trim() !== ""
        ? data.assignedTechnicianId
        : null

    createMutation.mutate(
      {
        title: data.title.trim(),
        description: data.description?.trim() ? data.description.trim() : undefined,
        priority: data.priority,
        siteName: data.siteName.trim(),
        assignedTechnicianId: assignedTechId,
        scheduledStart: toIsoOrNull(data.scheduledStart),
        scheduledEnd: toIsoOrNull(data.scheduledEnd),
      },
      {
        onSuccess: () => {
          reset()
          onClose()
        },
      }
    )
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create New Work Order"
      description="Reference number will be auto-generated following organizational sequence."
      size="xl"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Title *"
          placeholder="e.g. HVAC Compressor Overhaul - Level 4"
          error={errors.title?.message}
          {...register("title")}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Site Name *"
            placeholder="e.g. Apex Tower North - Floor 3"
            error={errors.siteName?.message}
            {...register("siteName")}
          />

          <div>
            <label
              htmlFor="priority-select"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Priority *
            </label>
            <select
              id="priority-select"
              className="flex h-9 w-full rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              {...register("priority")}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            {errors.priority && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {errors.priority.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="technician-select"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
          >
            Assigned Technician
          </label>
          <select
            id="technician-select"
            disabled={isTechLoading}
            className="flex h-9 w-full rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
            {...register("assignedTechnicianId")}
          >
            <option value="">Unassigned (Queue for Dispatch)</option>
            {technicians.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.name} ({tech.email})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Controller
            name="scheduledStart"
            control={control}
            render={({ field }) => (
              <DateTimePicker
                id="create-scheduled-start"
                label="Scheduled Start"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.scheduledStart?.message}
              />
            )}
          />
          <Controller
            name="scheduledEnd"
            control={control}
            render={({ field }) => (
              <DateTimePicker
                id="create-scheduled-end"
                label="Scheduled End"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.scheduledEnd?.message}
              />
            )}
          />
        </div>

        <Textarea
          label="Description / Scope of Work"
          rows={3}
          placeholder="Provide equipment details, safety requirements, or maintenance instructions..."
          error={errors.description?.message}
          {...register("description")}
        />

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="default"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <span>Create Work Order</span>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

