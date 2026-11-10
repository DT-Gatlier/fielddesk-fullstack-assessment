import apiClient from "@/app/api/client"
import type {
  AssignTechnicianInput,
  CreateWorkOrderInput,
  PaginatedWorkOrders,
  ProgressEventResponse,
  StorageQuota,
  SubmitProgressEventInput,
  TechnicianUser,
  UpdateWorkOrderInput,
  WorkOrder,
  WorkOrderAttachment,
  WorkOrderFilters,
} from "./type"

export * from "./type"

export const workOrderService = {
  list: async (filters?: WorkOrderFilters): Promise<PaginatedWorkOrders> => {
    const params: Record<string, any> = {}
    if (filters?.page) params.page = filters.page
    if (filters?.limit) params.limit = filters.limit
    if (filters?.status && filters.status !== "all") params.status = filters.status
    if (filters?.priority && filters.priority !== "all") params.priority = filters.priority
    if (filters?.search && filters.search.trim()) params.search = filters.search.trim()
    if (filters?.sortBy) params.sortBy = filters.sortBy
    if (filters?.sortOrder) params.sortOrder = filters.sortOrder

    const res = await apiClient.get<PaginatedWorkOrders>("/work-orders", { params })
    return res.data
  },

  getById: async (id: string): Promise<WorkOrder> => {
    const res = await apiClient.get<{ workOrder: WorkOrder }>(`/work-orders/${id}`)
    return res.data.workOrder
  },

  create: async (payload: CreateWorkOrderInput): Promise<WorkOrder> => {
    const res = await apiClient.post<{ workOrder: WorkOrder; message: string }>(
      "/work-orders",
      payload
    )
    return res.data.workOrder
  },

  update: async (id: string, payload: UpdateWorkOrderInput): Promise<WorkOrder> => {
    const res = await apiClient.patch<{ workOrder: WorkOrder; message: string }>(
      `/work-orders/${id}`,
      payload
    )
    return res.data.workOrder
  },

  getTechnicians: async (): Promise<TechnicianUser[]> => {
    const res = await apiClient.get<{ technicians: TechnicianUser[] }>("/users/technicians")
    return res.data.technicians
  },

  assignTechnician: async (
    id: string,
    payload: AssignTechnicianInput
  ): Promise<WorkOrder> => {
    const res = await apiClient.post<WorkOrder>(`/work-orders/${id}/assign`, payload)
    return res.data
  },

  submitProgressEvent: async (
    workOrderId: string,
    payload: SubmitProgressEventInput
  ): Promise<ProgressEventResponse> => {
    const res = await apiClient.post<ProgressEventResponse>(
      `/work-orders/${workOrderId}/events`,
      payload
    )
    return res.data
  },

  uploadAttachment: async (
    workOrderId: string,
    file: File
  ): Promise<WorkOrderAttachment> => {
    const formData = new FormData()
    formData.append("file", file)
    const res = await apiClient.post<WorkOrderAttachment>(
      `/work-orders/${workOrderId}/attachments`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    )
    return res.data
  },

  listAttachments: async (workOrderId: string): Promise<WorkOrderAttachment[]> => {
    const res = await apiClient.get<{ attachments: WorkOrderAttachment[] }>(
      `/work-orders/${workOrderId}/attachments`
    )
    return res.data.attachments
  },

  downloadAttachment: async (attachmentId: string, filename: string): Promise<void> => {
    const res = await apiClient.get(`/attachments/${attachmentId}/download`, {
      responseType: "blob",
    })
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", filename)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },

  deleteAttachment: async (attachmentId: string): Promise<void> => {
    await apiClient.delete(`/attachments/${attachmentId}`)
  },

  getStorageQuota: async (): Promise<StorageQuota> => {
    const res = await apiClient.get<StorageQuota>("/organisations/quota")
    return res.data
  },
}

