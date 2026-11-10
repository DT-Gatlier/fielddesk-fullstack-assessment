import { useQuery } from "@tanstack/react-query"
import { dashboardService } from "../services"

export const useDashboardMetrics = () => {
  return useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => dashboardService.getMetrics(),
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  })
}

