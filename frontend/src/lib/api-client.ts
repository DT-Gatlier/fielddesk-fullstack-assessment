import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { RefreshResponse } from '../features/auth/types/auth.types';

// In-memory token storage
let currentAccessToken: string | null = null;
let currentRefreshToken: string | null = localStorage.getItem('fielddesk_refresh_token');
let onSessionExpiredCallback: (() => void) | null = null;

export function setTokens(accessToken: string | null, refreshToken: string | null) {
  currentAccessToken = accessToken;
  currentRefreshToken = refreshToken;

  if (refreshToken) {
    localStorage.setItem('fielddesk_refresh_token', refreshToken);
  } else {
    localStorage.removeItem('fielddesk_refresh_token');
  }
}

export function getStoredRefreshToken(): string | null {
  return currentRefreshToken || localStorage.getItem('fielddesk_refresh_token');
}

export function registerSessionExpiredHandler(cb: () => void) {
  onSessionExpiredCallback = cb;
}

export const apiClient = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach Authorization header & Correlation ID
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (currentAccessToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${currentAccessToken}`;
  }

  if (!config.headers['x-correlation-id']) {
    config.headers['x-correlation-id'] = `web_${crypto.randomUUID()}`;
  }

  return config;
});

// Response interceptor: handle 401 with automatic token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: any) => void;
}> = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Don't intercept auth endpoints to prevent infinite refresh loops
    if (
      !originalRequest ||
      originalRequest.url?.includes('/api/v1/auth/login') ||
      originalRequest.url?.includes('/api/v1/auth/refresh')
    ) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (newToken: string) => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(apiClient(originalRequest));
            },
            reject: (err: any) => reject(err),
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const storedRefresh = getStoredRefreshToken();
      if (!storedRefresh) {
        isRefreshing = false;
        setTokens(null, null);
        if (onSessionExpiredCallback) onSessionExpiredCallback();
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post<RefreshResponse>('/api/v1/auth/refresh', {
          refreshToken: storedRefresh,
        });

        setTokens(data.accessToken, data.refreshToken);
        processQueue(null, data.accessToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        setTokens(null, null);
        if (onSessionExpiredCallback) {
          onSessionExpiredCallback();
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

