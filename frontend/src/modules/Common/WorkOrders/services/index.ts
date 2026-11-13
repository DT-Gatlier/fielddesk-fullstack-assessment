import apiClient from "@/app/api/client"
import type {
  ActivityLogItem,
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

    const res = await apiClient.get<any>("/work-orders", { params })
    const rawData = res.data?.data ?? (Array.isArray(res.data) ? res.data : [])
    const pagination = res.data?.pagination || res.data?.meta
    return {
      data: rawData,
      meta: {
        totalRecords: pagination?.totalRecords ?? rawData.length,
        totalPages: pagination?.totalPages ?? 1,
        currentPage: pagination?.page ?? pagination?.currentPage ?? filters?.page ?? 1,
        limit: pagination?.limit ?? filters?.limit ?? 10,
      },
    }
  },

  getById: async (id: string): Promise<WorkOrder> => {
    const res = await apiClient.get<any>(`/work-orders/${id}`)
    return (res.data?.workOrder ?? res.data) as WorkOrder
  },

  create: async (payload: CreateWorkOrderInput): Promise<WorkOrder> => {
    const res = await apiClient.post<any>("/work-orders", payload)
    return (res.data?.workOrder ?? res.data) as WorkOrder
  },

  update: async (id: string, payload: UpdateWorkOrderInput): Promise<WorkOrder> => {
    const res = await apiClient.patch<any>(`/work-orders/${id}`, payload)
    return (res.data?.workOrder ?? res.data) as WorkOrder
  },

  getTechnicians: async (): Promise<TechnicianUser[]> => {
    const res = await apiClient.get<any>("/users/technicians")
    return res.data?.technicians ?? (Array.isArray(res.data) ? res.data : [])
  },

  assignTechnician: async (
    id: string,
    payload: AssignTechnicianInput
  ): Promise<WorkOrder> => {
    const res = await apiClient.post<any>(`/work-orders/${id}/assign`, payload)
    return (res.data?.workOrder ?? res.data) as WorkOrder
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
    const res = await apiClient.get<any>(
      `/work-orders/${workOrderId}/attachments`
    )
    return res.data?.attachments ?? (Array.isArray(res.data) ? res.data : [])
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

  getActivity: async (workOrderId: string): Promise<ActivityLogItem[]> => {
    const res = await apiClient.get<any>(`/work-orders/${workOrderId}/activity`)
    return Array.isArray(res.data) ? res.data : (res.data?.activities ?? [])
  },

  exportCsv: async (filters?: WorkOrderFilters): Promise<string> => {
    const params: Record<string, any> = {}
    if (filters?.status && filters.status !== "all") params.status = filters.status
    if (filters?.priority && filters.priority !== "all") params.priority = filters.priority
    if (filters?.search && filters.search.trim()) params.search = filters.search.trim()

    const res = await apiClient.get("/work-orders/export/csv", {
      params,
      responseType: "blob",
    })

    const today = new Date().toISOString().slice(0, 10)
    let filename = `work-orders-export-${today}.csv`
    const disposition = res.headers?.["content-disposition"]
    if (typeof disposition === "string") {
      const match = disposition.match(/filename="([^"]+)"/)
      if (match?.[1]) {
        filename = match[1]
      }
    }

    const url = window.URL.createObjectURL(
      new Blob([res.data], { type: "text/csv;charset=utf-8;" })
    )
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", filename)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)

    return filename
  },
}

