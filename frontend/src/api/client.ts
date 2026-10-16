/**
 * Thin fetch wrapper. All calls go to the same-origin /api; the session lives
 * in an httpOnly cookie the browser attaches automatically, so this code never
 * sees or stores a credential.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
  }

  /** Field-level validation messages keyed by field path. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== 'VALIDATION_FAILED' || !Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const d of this.details as { path: string; message: string }[]) out[d.path || '_'] ??= d.message;
    return out;
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
/** The auth layer subscribes so an expired session sends the user back to the login screen. */
export const onUnauthorized = (fn: Listener) => {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
};

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...rest,
      headers: {
        Accept: 'application/json',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error;
    if (res.status === 401 && !path.startsWith('/auth/login')) unauthorizedListeners.forEach((fn) => fn());
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? `Request failed (${res.status})`, e?.details, e?.requestId);
  }
  return body as T;
}

export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}
