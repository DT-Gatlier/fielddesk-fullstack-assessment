import { useMutation, useQuery } from "@tanstack/react-query"
import type { AxiosError } from "axios"
import { toast } from "sonner"

import { queryClient } from "@/app/api/configs/tanStackQuery"
import { workOrderService } from "../services"
import type {
  AssignTechnicianInput,
  CreateWorkOrderInput,
  SchedulingConflictErrorResponse,
  SubmitProgressEventInput,
  UpdateWorkOrderInput,
  WorkOrderFilters,
} from "../services/type"

export const useWorkOrders = (filters: WorkOrderFilters) => {
  return useQuery({
    queryKey: ["work-orders", filters],
    queryFn: () => workOrderService.list(filters),
    staleTime: 10 * 1000,
  })
}

export const useWorkOrderDetail = (id: string | null) => {
  return useQuery({
    queryKey: ["work-order-detail", id],
    queryFn: () => (id ? workOrderService.getById(id) : null),
    enabled: !!id,
  })
}

export const useTechnicians = () => {
  return useQuery({
    queryKey: ["technicians-list"],
    queryFn: () => workOrderService.getTechnicians(),
    staleTime: 60 * 1000,
  })
}

export const useCreateWorkOrder = () => {
  return useMutation({
    mutationFn: (payload: CreateWorkOrderInput) => workOrderService.create(payload),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["work-orders"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] })
      toast.success(`Work order ${data.referenceNumber} created successfully`)
    },
    onError: (error: AxiosError<{ message?: string; error?: string }>) => {
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          "Failed to create work order"
      )
    },
  })
}

export const useUpdateWorkOrder = () => {
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateWorkOrderInput }) =>
      workOrderService.update(id, payload),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["work-orders"] })
      void queryClient.invalidateQueries({ queryKey: ["work-order-detail", data.id] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] })
      toast.success(`Work order ${data.referenceNumber} updated successfully`)
    },
    onError: (error: AxiosError<{ message?: string; error?: string }>) => {
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          "Failed to update work order"
      )
    },
  })
}

export const useAssignTechnician = () => {
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AssignTechnicianInput }) =>
      workOrderService.assignTechnician(id, payload),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["work-orders"] })
      void queryClient.invalidateQueries({ queryKey: ["work-order-detail", data.id] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] })
      toast.success(`Technician assigned to ${data.referenceNumber}`)
    },
    onError: (error: AxiosError<SchedulingConflictErrorResponse>) => {
      if (error?.response?.status !== 409) {
        toast.error(
          error?.response?.data?.detail ||
            error?.response?.data?.title ||
            "Failed to assign technician"
        )
      }
    },
  })
}

export const useSubmitProgressEvent = () => {
  return useMutation({
    mutationFn: ({
      workOrderId,
      payload,
    }: {
      workOrderId: string
      payload: SubmitProgressEventInput
    }) => workOrderService.submitProgressEvent(workOrderId, payload),
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["work-orders"] })
      void queryClient.invalidateQueries({
        queryKey: ["work-order-detail", variables.workOrderId],
      })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] })
      if (data.status === "applied") {
        toast.success(
          `Progress event recorded: ${data.newStatus ? `status updated to "${data.newStatus.replace("_", " ")}"` : "applied"}`
        )
      } else if (data.status === "duplicate_ignored") {
        toast.info(data.message || `Event ${data.eventId} was already processed (duplicate ignored)`)
      }
    },
    onError: (error: AxiosError<{ message?: string; error?: string; detail?: string }>) => {
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          "Failed to record progress event"
      )
    },
  })
}

export const useStorageQuota = () => {
  return useQuery({
    queryKey: ["storage-quota"],
    queryFn: () => workOrderService.getStorageQuota(),
    staleTime: 30 * 1000,
  })
}

export const useWorkOrderAttachments = (workOrderId: string | null) => {
  return useQuery({
    queryKey: ["work-order-attachments", workOrderId],
    queryFn: () => (workOrderId ? workOrderService.listAttachments(workOrderId) : []),
    enabled: !!workOrderId,
    staleTime: 10 * 1000,
  })
}

export const useUploadAttachment = () => {
  return useMutation({
    mutationFn: ({ workOrderId, file }: { workOrderId: string; file: File }) =>
      workOrderService.uploadAttachment(workOrderId, file),
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["work-order-attachments", variables.workOrderId],
      })
      void queryClient.invalidateQueries({
        queryKey: ["work-order-detail", variables.workOrderId],
      })
      void queryClient.invalidateQueries({ queryKey: ["storage-quota"] })
      toast.success(`Attached "${data.originalFilename}" successfully`)
    },
    onError: (error: AxiosError<{ message?: string; error?: string; detail?: string; code?: string }>) => {
      if (error?.response?.data?.code === "QUOTA_EXCEEDED") {
        toast.error(
          error?.response?.data?.detail || "Organisation storage quota exceeded! Delete old files or upgrade storage."
        )
      } else if (error?.response?.data?.code === "INVALID_FILE_TYPE") {
        toast.error("Unsupported file type. Only JPEG, PNG, and PDF files are allowed.")
      } else if (error?.response?.data?.code === "FILE_TOO_LARGE") {
        toast.error("File size exceeds 10MB limit.")
      } else {
        toast.error(
          error?.response?.data?.detail ||
            error?.response?.data?.message ||
            error?.response?.data?.error ||
            "Failed to upload attachment"
        )
      }
    },
  })
}

export const useDeleteAttachment = () => {
  return useMutation({
    mutationFn: ({ attachmentId }: { attachmentId: string; workOrderId?: string }) =>
      workOrderService.deleteAttachment(attachmentId),
    onSuccess: (_, variables) => {
      if (variables.workOrderId) {
        void queryClient.invalidateQueries({
          queryKey: ["work-order-attachments", variables.workOrderId],
        })
        void queryClient.invalidateQueries({
          queryKey: ["work-order-detail", variables.workOrderId],
        })
      }
      void queryClient.invalidateQueries({ queryKey: ["storage-quota"] })
      toast.success("Attachment deleted")
    },
    onError: (error: AxiosError<{ message?: string; error?: string; detail?: string }>) => {
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          "Failed to delete attachment"
      )
    },
  })
}

