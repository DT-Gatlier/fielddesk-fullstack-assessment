import type { ApiErrorBody } from '../types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api/v1';
let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
let onAuthLost: (() => void) | null = null;

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'REQUEST_FAILED', public details?: unknown, public requestId?: string) {
    super(message);
  }
}

export function configureAuth(token: string | null, authLost?: () => void) {
  accessToken = token;
  if (authLost) onAuthLost = authLost;
}

export function getAccessToken() { return accessToken; }

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }).then(async (response) => {
      if (!response.ok) return false;
      const body = await response.json() as { data: { accessToken: string } };
      accessToken = body.data.accessToken;
      return true;
    }).catch(() => false).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function parseError(response: Response) {
  const body = await response.json().catch(() => null) as ApiErrorBody | null;
  return new ApiError(response.status, body?.error.message ?? response.statusText ?? 'Request failed', body?.error.code, body?.error.details, body?.requestId);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshAccessToken()) return apiFetch<T>(path, init, false);
    accessToken = null;
    onAuthLost?.();
  }
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function downloadFile(path: string, fallbackName: string) {
  const headers = new Headers();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let response = await fetch(`${API_URL}${path}`, { headers, credentials: 'include' });
  if (response.status === 401 && await refreshAccessToken()) {
    headers.set('Authorization', `Bearer ${accessToken}`);
    response = await fetch(`${API_URL}${path}`, { headers, credentials: 'include' });
  }
  if (!response.ok) throw await parseError(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fallbackName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export { API_URL };
