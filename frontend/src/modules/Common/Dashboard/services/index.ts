import apiClient from "@/app/api/client"
import type { DashboardMetrics } from "./type"

export * from "./type"

export const dashboardService = {
  getMetrics: async (): Promise<DashboardMetrics> => {
    const res = await apiClient.get<{ metrics: DashboardMetrics }>("/dashboard/metrics")
    return res.data.metrics
  },
}

