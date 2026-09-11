const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  organisationId: string;
};

export type WorkOrder = {
  id: string;
  organisationId: string;
  createdByUserId: string;
  assignedTechnicianId: string | null;
  referenceNumber: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  siteName: string;
  assignmentVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type AuditEntry = {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type DashboardSummary = {
  total: number;
  byStatus: Record<string, number>;
};

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  const hasJsonBody =
    init?.body !== undefined && init?.body !== null && init?.body !== "";

  if (hasJsonBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers,
  });

  if (!response.ok) {
    const error = await response.json() as ApiError;
    throw new ApiRequestError(
      error.error?.message ?? "Request failed",
      error.error?.code ?? "UNKNOWN",
    );
  }

  return response.json() as Promise<T>;
}

export async function login(
  email: string,
  password: string,
): Promise<{ user: AuthUser }> {
  return apiFetch("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<void> {
  await apiFetch("/api/v1/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<{ user: AuthUser } | null> {
  const response = await fetch(`${API_URL}/api/v1/auth/me`, {
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const error = await response.json() as ApiError;
    throw new Error(error.error.message);
  }

  return response.json() as Promise<{ user: AuthUser }>;
}

export async function getDashboardSummary(): Promise<{ summary: DashboardSummary }> {
  return apiFetch("/api/v1/dashboard/summary");
}

export async function listWorkOrders(params: Record<string, string> = {}): Promise<{
  items: WorkOrder[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const query = new URLSearchParams(params).toString();
  return apiFetch(`/api/v1/work-orders${query ? `?${query}` : ""}`);
}

export async function downloadWorkOrdersCsv(
  params: Record<string, string> = {},
): Promise<void> {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(
    `${API_URL}/api/v1/exports/work-orders.csv${query ? `?${query}` : ""}`,
    { credentials: "include" },
  );

  if (!response.ok) {
    const error = await response.json() as ApiError;
    throw new ApiRequestError(
      error.error?.message ?? "Export failed",
      error.error?.code ?? "UNKNOWN",
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "work-orders.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export async function getWorkOrder(id: string): Promise<{
  workOrder: WorkOrder;
  activity: AuditEntry[];
}> {
  return apiFetch(`/api/v1/work-orders/${id}`);
}

export async function createWorkOrder(input: {
  title: string;
  description: string;
  priority: string;
  siteName: string;
}): Promise<{ workOrder: WorkOrder }> {
  return apiFetch("/api/v1/work-orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateWorkOrder(
  id: string,
  input: Partial<{
    title: string;
    description: string;
    priority: string;
    siteName: string;
  }>,
): Promise<{ workOrder: WorkOrder }> {
  return apiFetch(`/api/v1/work-orders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function assignWorkOrder(
  id: string,
  input: {
    assignedTechnicianId: string;
    scheduledStart: string;
    scheduledEnd: string;
  },
): Promise<{ workOrder: WorkOrder }> {
  return apiFetch(`/api/v1/work-orders/${id}/assign`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateWorkOrderStatus(
  id: string,
  status: string,
): Promise<{ workOrder: WorkOrder }> {
  return apiFetch(`/api/v1/work-orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function submitProgressEvent(input: {
  eventId: string;
  workOrderId: string;
  type: "status_changed" | "note_added";
  occurredAt: string;
  payload: Record<string, unknown>;
}): Promise<{ event: Record<string, unknown>; workOrder: WorkOrder }> {
  return apiFetch("/api/v1/progress-events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listOrgUsers(): Promise<{ users: AuthUser[] }> {
  return apiFetch("/api/v1/users");
}

export type WorkOrderAttachment = {
  id: string;
  workOrderId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export async function listWorkOrderAttachments(
  workOrderId: string,
): Promise<{ attachments: WorkOrderAttachment[] }> {
  return apiFetch(`/api/v1/work-orders/${workOrderId}/attachments`);
}

export async function uploadWorkOrderAttachment(
  workOrderId: string,
  file: File,
): Promise<{ attachment: WorkOrderAttachment }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${API_URL}/api/v1/work-orders/${workOrderId}/attachments`,
    {
      method: "POST",
      credentials: "include",
      body: formData,
    },
  );

  if (!response.ok) {
    const error = await response.json() as ApiError;
    throw new ApiRequestError(
      error.error?.message ?? "Upload failed",
      error.error?.code ?? "UNKNOWN",
    );
  }

  return response.json() as Promise<{ attachment: WorkOrderAttachment }>;
}

export async function downloadWorkOrderAttachment(
  attachmentId: string,
  filename: string,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/v1/attachments/${attachmentId}/download`,
    {
      credentials: "include",
    },
  );

  if (!response.ok) {
    const error = await response.json() as ApiError;
    throw new ApiRequestError(
      error.error?.message ?? "Download failed",
      error.error?.code ?? "UNKNOWN",
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
