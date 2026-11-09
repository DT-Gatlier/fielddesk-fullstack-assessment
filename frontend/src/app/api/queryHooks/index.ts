import { useNavigate } from "react-router-dom"
import { useMutation, useQuery } from "@tanstack/react-query"
import type { AxiosError } from "axios"
import { toast } from "sonner"

import { ROUTE_CONFIG } from "@/app/router/config"

import { queryClient } from "../configs/tanStackQuery"
import { authenticationService } from "../services/authentication"
import { workOrderService } from "../services/work-orders"
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrderFilters,
} from "../services/work-orders/type"

export const useLoginWithCredentials = () => {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (payload: { email: string; password: string }) =>
      authenticationService.loginWithCredentials(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(["user-info"], { user: data.user })
      void queryClient.invalidateQueries({ queryKey: ["user-permissions"] })
      toast.success(`Welcome back, ${data.user.name}`)
      void navigate(ROUTE_CONFIG.dashboard.path, { replace: true })
    },
    onError: (error: AxiosError<{ message?: string; error?: string }>) => {
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          "Login failed. Please check your credentials and try again."
      )
    },
  })
}

export const useGetProfileDetails = () => {
  return useQuery({
    queryKey: ["user-info"],
    queryFn: () => authenticationService.userInfo(),
    retry: false,
    staleTime: 60 * 1000,
  })
}

export const useGetPermissions = () => {
  const { data: userInfo } = useGetProfileDetails()

  return useQuery({
    queryKey: ["user-permissions"],
    queryFn: () => authenticationService.permissions(),
    enabled: !!userInfo?.user?.id,
    retry: false,
    staleTime: 60 * 1000,
  })
}

export const useLogout = () => {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: () => authenticationService.logOut(),
    onSuccess: () => {
      void queryClient.removeQueries({ queryKey: ["user-info"] })
      void queryClient.removeQueries({ queryKey: ["user-permissions"] })
      void navigate(ROUTE_CONFIG.login.path, { replace: true })
      toast.info("You have been signed out.")
    },
    onError: () => {
      void queryClient.removeQueries({ queryKey: ["user-info"] })
      void queryClient.removeQueries({ queryKey: ["user-permissions"] })
      void navigate(ROUTE_CONFIG.login.path, { replace: true })
    },
  })
}

export const usePermissions = () => {
  const { data: profile } = useGetProfileDetails()
  const { data: permsData, isLoading } = useGetPermissions()

  const permissions = permsData?.permissions || []
  const role = profile?.user?.role || ""

  const hasPermission = (permission: string) => permissions.includes(permission)
  const hasAnyPermission = (required: string[]) =>
    required.some((p) => permissions.includes(p))
  const hasRole = (...roles: string[]) =>
    roles.map((r) => r.toLowerCase()).includes(role.toLowerCase())

  return {
    permissions,
    role,
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasRole,
  }
}

export const useDashboardMetrics = () => {
  return useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => workOrderService.getMetrics(),
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  })
}

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


