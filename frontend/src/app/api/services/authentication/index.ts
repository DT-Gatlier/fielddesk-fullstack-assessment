import axios from "axios"

import { ENV } from "@/app/api/configs/environment"

import apiClient, {
  clearAuthSession,
  getAccessToken,
  getStoredRefreshToken,
  setAccessToken,
  setStoredRefreshToken,
} from "../../client"
import type {
  LoginResponse,
  LogOutResponse,
  PermissionsResponse,
  RefreshTokenResponse,
  UserInfo,
} from "./type"

// authenticationApiClient is specifically for auth-related calls (login, refresh, logout)
// without the automatic 401 retry interceptor to prevent infinite loops.
const authenticationApiClient = axios.create({
  baseURL: ENV.API_BASE_URL,
  timeout: ENV.API_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
  },
})

authenticationApiClient.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`
  }

  if (!config.headers["x-correlation-id"]) {
    const randomUuid = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2)
    config.headers["x-correlation-id"] = `web_${randomUuid}`
  }

  return config
})

export const authenticationService = {
  loginWithCredentials: async (payload: {
    email: string
    password: string
  }): Promise<LoginResponse> => {
    const response = await authenticationApiClient.post<LoginResponse>(
      "/auth/login",
      payload
    )
    if (response.data.accessToken) {
      setAccessToken(response.data.accessToken)
    }
    if (response.data.refreshToken) {
      setStoredRefreshToken(response.data.refreshToken)
    }
    return response.data
  },

  userInfo: async (): Promise<UserInfo> => {
    // If no access token is in memory but a stored refresh token exists, refresh first
    if (!getAccessToken() && getStoredRefreshToken()) {
      try {
        const refreshed = await authenticationService.refreshToken()
        if (refreshed.accessToken) {
          setAccessToken(refreshed.accessToken)
        }
        if (refreshed.refreshToken) {
          setStoredRefreshToken(refreshed.refreshToken)
        }
      } catch {
        clearAuthSession()
        throw new Error("Session expired")
      }
    }

    if (!getAccessToken()) {
      throw new Error("No active session")
    }

    const response = await apiClient.get<UserInfo>("/auth/me")
    return response.data
  },

  permissions: async (): Promise<PermissionsResponse> => {
    const response = await apiClient.get<PermissionsResponse>("/auth/permissions")
    return response.data
  },

  refreshToken: async (): Promise<RefreshTokenResponse> => {
    const storedToken = getStoredRefreshToken()
    if (!storedToken) {
      throw new Error("No refresh token available")
    }

    const response = await authenticationApiClient.post<RefreshTokenResponse>(
      "/auth/refresh",
      { refreshToken: storedToken }
    )

    if (response.data.accessToken) {
      setAccessToken(response.data.accessToken)
    }
    if (response.data.refreshToken) {
      setStoredRefreshToken(response.data.refreshToken)
    }

    return response.data
  },

  logOut: async (): Promise<LogOutResponse> => {
    try {
      const response = await authenticationApiClient.post<LogOutResponse>("/auth/logout")
      return response.data
    } finally {
      clearAuthSession()
    }
  },
}

