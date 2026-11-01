// All HTTP goes through here. The access token lives in memory only (never localStorage);
// the refresh token is an httpOnly cookie managed by the backend.
let accessToken = null;
let onAuthLost = () => {};
export const setAuthLostHandler = (fn) => { onAuthLost = fn; };

export class ApiError extends Error {
  constructor(status, body) {
    const e = body?.error ?? {};
    const d = e.details;
    let msg = e.message;
    if (status === 400 && d && !d.detail) msg = "Please correct the highlighted fields.";
    else if (d && d.detail) msg = String(d.detail);
    super(msg || `Request failed (${status})`);
    this.status = status;
    this.code = e.code || "error";
    this.details = d || null;
    this.requestId = e.request_id || null;
  }
}

// Turns DRF validation details into { field: "message" }
export function fieldErrors(err) {
  const out = {};
  if (err?.status === 400 && err.details && typeof err.details === "object") {
    for (const [k, v] of Object.entries(err.details)) out[k] = Array.isArray(v) ? v.join(" ") : String(v);
  }
  return out;
}

let refreshing = null; // share one refresh call (refresh tokens rotate, so parallel calls would fail)
function refresh() {
  refreshing ??= fetch("/api/auth/refresh/", { method: "POST", credentials: "include" })
    .then(async (r) => {
      if (!r.ok) throw new Error("no session");
      const d = await r.json();
      accessToken = d.access_token;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function raw(path, { method = "GET", body, isForm = false, retry = true } = {}) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "include",
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    try {
      await refresh();
    } catch {
      accessToken = null;
      onAuthLost();
      throw new ApiError(401, { error: { message: "Session expired. Please sign in again." } });
    }
    return raw(path, { method, body, isForm, retry: false });
  }
  return res;
}

async function json(path, opts) {
  const res = await raw(path, opts);
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

const qs = (p) => {
  const s = new URLSearchParams();
  Object.entries(p || {}).forEach(([k, v]) => { if (v !== "" && v != null) s.set(k, v); });
  const t = s.toString();
  return t ? `?${t}` : "";
};
const asList = (d) => (Array.isArray(d) ? d : d.results);

async function download(path, filename) {
  const res = await raw(path);
  if (!res.ok) {
    let d = null;
    try { d = await res.json(); } catch { /* not json */ }
    throw new ApiError(res.status, d);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  async login(login, password) {
    const d = await json("/auth/login/", { method: "POST", body: { login, password } });
    accessToken = d.access_token;
    return d;
  },
  async logout() {
    try { await json("/auth/logout/", { method: "POST" }); } finally { accessToken = null; }
  },
  restore: () => refresh(),
  me: () => json("/me/"),
  dashboard: () => json("/dashboard/"),
  listOrders: (p) => json(`/work-orders/${qs(p)}`),
  getOrder: (id) => json(`/work-orders/${id}/`),
  createOrder: (b) => json("/work-orders/", { method: "POST", body: b }),
  updateOrder: (id, b) => json(`/work-orders/${id}/`, { method: "PATCH", body: b }),
  assign: (id, b) => json(`/work-orders/${id}/assign/`, { method: "PATCH", body: b }),
  setStatus: (id, status) => json(`/work-orders/${id}/status/`, { method: "PATCH", body: { status } }),
  activity: async (id) => asList(await json(`/work-orders/${id}/activity/`)),
  technicians: async () => asList(await json("/technicians/")),
  attachments: async (id) => asList(await json(`/work-orders/${id}/attachments/`)),
  upload(id, file) {
    const f = new FormData();
    f.append("file", file);
    return json(`/work-orders/${id}/attachments/`, { method: "POST", body: f, isForm: true });
  },
  sendEvent: (b) => json("/events/", { method: "POST", body: b }),
  streamTicket: () => json("/stream-ticket/", { method: "POST" }),
  exportCsv: (p) => download(`/work-orders/export/${qs(p)}`, "work-orders.csv"),
  downloadAttachment: (a) => download(`/attachments/${a.id}/download/`, a.original_name || `file-${a.id}`),
};
