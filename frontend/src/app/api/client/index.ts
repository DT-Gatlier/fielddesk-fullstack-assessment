import axios, {
  type AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios"

import { ENV } from "../configs/environment"
import { queryClient } from "../configs/tanStackQuery"
import { handleError } from "../helpers/apiErrorHandler"
import { authenticationService } from "../services/authentication"

let inMemoryAccessToken: string | null = null

export const setAccessToken = (token: string | null) => {
  inMemoryAccessToken = token
}

export const getAccessToken = (): string | null => {
  return inMemoryAccessToken
}

export const getStoredRefreshToken = (): string | null => {
  return localStorage.getItem("fielddesk_refresh_token")
}

export const setStoredRefreshToken = (token: string | null) => {
  if (token) {
    localStorage.setItem("fielddesk_refresh_token", token)
  } else {
    localStorage.removeItem("fielddesk_refresh_token")
  }
}

export const clearAuthSession = () => {
  inMemoryAccessToken = null
  localStorage.removeItem("fielddesk_refresh_token")
  queryClient.setQueryData(["user-info"], null)
  queryClient.setQueryData(["user-permissions"], null)
}

const apiClient = axios.create({
  baseURL: ENV.API_BASE_URL,
  timeout: ENV.API_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
  },
})

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (inMemoryAccessToken && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${inMemoryAccessToken}`
    }

    if (!config.headers["x-correlation-id"]) {
      const randomUuid = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2)
      config.headers["x-correlation-id"] = `web_${randomUuid}`
    }

    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    // Attempt token refresh on 401 before treating it as a real error
    if (
      error?.response?.status === 401 &&
      originalRequest &&
      !originalRequest?._retry &&
      !originalRequest.url?.includes("/auth/login") &&
      !originalRequest.url?.includes("/auth/refresh")
    ) {
      originalRequest._retry = true
      try {
        const refreshResponse = await authenticationService.refreshToken()
        if (refreshResponse?.accessToken) {
          setAccessToken(refreshResponse.accessToken)
          if (refreshResponse.refreshToken) {
            setStoredRefreshToken(refreshResponse.refreshToken)
          }
          originalRequest.headers.Authorization = `Bearer ${refreshResponse.accessToken}`
          return apiClient(originalRequest)
        }
      } catch (refreshError) {
        clearAuthSession()
        return Promise.reject(
          refreshError instanceof Error
            ? refreshError
            : new Error(String(refreshError))
        )
      }
    }

    handleError(error)
    return Promise.reject(error)
  }
)

export default apiClient

