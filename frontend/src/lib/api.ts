const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const contentType = response.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = data?.message || "An unexpected error occurred";
    throw new Error(message);
  }

  return data as T;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "OWNER" | "DISPATCHER" | "TECHNICIAN";
  organisationId: string;
  organisation?: {
    id: string;
    name: string;
    slug?: string;
  };
}

export interface WorkOrderItem {
  id: string;
  referenceNumber: string;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  siteName: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  organisationId: string;
  creatorId: string;
  assignedTechnicianId: string | null;
  assignedTechnician?: {
    id: string;
    name: string;
    email: string;
  } | null;
  creator?: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderMetrics {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  highPriority: number;
}

export interface TechnicianItem {
  id: string;
  name: string;
  email: string;
}

export const authApi = {
  login: async (email: string, password: string, organisationId?: string) => {
    return apiRequest<{ success: boolean; user: AuthUser; message: string }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password, organisationId }),
      }
    );
  },

  logout: async () => {
    return apiRequest<{ success: boolean; message: string }>("/api/auth/logout", {
      method: "POST",
    });
  },

  getMe: async () => {
    return apiRequest<{ success: boolean; user: AuthUser }>("/api/auth/me", {
      method: "GET",
    });
  },

  getOrganisations: async () => {
    return apiRequest<{
      success: boolean;
      organisations: Array<{ id: string; name: string; slug: string }>;
    }>("/api/auth/organisations", {
      method: "GET",
    });
  },
};

export const workOrdersApi = {
  list: async (params: {
    status?: string;
    priority?: string;
    technicianId?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.status && params.status !== "ALL") searchParams.set("status", params.status);
    if (params.priority && params.priority !== "ALL") searchParams.set("priority", params.priority);
    if (params.technicianId) searchParams.set("technicianId", params.technicianId);
    if (params.search) searchParams.set("search", params.search);
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));

    const qs = searchParams.toString();
    return apiRequest<{
      success: boolean;
      workOrders: WorkOrderItem[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/work-orders${qs ? `?${qs}` : ""}`, {
      method: "GET",
    });
  },

  getMetrics: async () => {
    return apiRequest<{ success: boolean; metrics: WorkOrderMetrics }>(
      "/api/work-orders/metrics",
      {
        method: "GET",
      }
    );
  },

  getTechnicians: async () => {
    return apiRequest<{ success: boolean; technicians: TechnicianItem[] }>(
      "/api/work-orders/technicians",
      {
        method: "GET",
      }
    );
  },

  create: async (data: {
    title: string;
    description: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    siteName: string;
    assignedTechnicianId?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
  }) => {
    return apiRequest<{ success: boolean; message: string; workOrder: WorkOrderItem }>(
      "/api/work-orders",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  },

  update: async (
    id: string,
    data: {
      title?: string;
      description?: string;
      priority?: string;
      status?: string;
      siteName?: string;
      assignedTechnicianId?: string | null;
      scheduledStart?: string | null;
      scheduledEnd?: string | null;
    }
  ) => {
    return apiRequest<{ success: boolean; message: string; workOrder: WorkOrderItem }>(
      `/api/work-orders/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      }
    );
  },
};
