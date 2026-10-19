export type Role = 'owner' | 'dispatcher' | 'technician';
export type Status = 'open' | 'scheduled' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export const STATUSES: Status[] = ['open', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled'];
export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organisation: { id: string; name: string };
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface WorkOrder {
  id: string;
  reference: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  siteName: string;
  assignedTechnician: { id: string; name: string | null } | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  createdBy: { id: string; name: string };
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: { id: string; name: string };
  createdAt: string;
  downloadUrl: string;
}

export interface ActivityEntry {
  id: number;
  action: string;
  actor: { type: 'system' } | { type: 'user'; id: string; name: string | null };
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface WorkOrderDetail extends WorkOrder {
  attachments: Attachment[];
  activity: ActivityEntry[];
}

export interface Page<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ErrorDetail {
  path?: string;
  message: string;
}

/** Mirrors the API's error format: { error: { code, message, details?, requestId } }. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ErrorDetail[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.filter((d) => d.path).map((d) => [d.path!, d.message]));
  }
}

export const UNAUTHENTICATED_EVENT = 'fielddesk:unauthenticated';

export async function api<T>(path: string, options: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? (options.json !== undefined || options.form ? 'POST' : 'GET'),
      credentials: 'same-origin',
      headers: options.json !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: options.form ?? (options.json !== undefined ? JSON.stringify(options.json) : undefined),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error;
    if (response.status === 401 && !path.endsWith('/auth/login')) window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? `Request failed (${response.status}).`,
      error?.details,
      error?.requestId,
    );
  }
  return body as T;
}

export const label = (value: string) => value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** <input type="datetime-local"> works in local time without a zone; the API requires one. */
export const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
