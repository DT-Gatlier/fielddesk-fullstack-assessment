import apiClient from "../../client"
import type {
  CreateWorkOrderInput,
  DashboardMetrics,
  PaginatedWorkOrders,
  TechnicianUser,
  UpdateWorkOrderInput,
  WorkOrder,
  WorkOrderFilters,
} from "./type"

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

  getMetrics: async (): Promise<DashboardMetrics> => {
    const res = await apiClient.get<{ metrics: DashboardMetrics }>("/dashboard/metrics")
    return res.data.metrics
  },

  getTechnicians: async (): Promise<TechnicianUser[]> => {
    const res = await apiClient.get<{ technicians: TechnicianUser[] }>("/users/technicians")
    return res.data.technicians
  },
}

