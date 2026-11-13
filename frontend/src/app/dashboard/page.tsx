"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  authApi,
  workOrdersApi,
  WorkOrderItem,
  WorkOrderMetrics,
  TechnicianItem,
} from "@/lib/api";
import { useToast } from "@/components/toast";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState, setCurrentUser } from "@/lib/store";

export default function DashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const user = useSelector((state: RootState) => state.session.user);
  const dispatch = useDispatch<AppDispatch>();
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "security">("overview");
  const [workOrders, setWorkOrders] = useState<WorkOrderItem[]>([]);
  const [metrics, setMetrics] = useState<WorkOrderMetrics>({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    highPriority: 0,
  });
  const [technicians, setTechnicians] = useState<TechnicianItem[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSiteName, setNewSiteName] = useState("");
  const [newPriority, setNewPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");
  const [newTechnicianId, setNewTechnicianId] = useState("");
  const [newScheduledStart, setNewScheduledStart] = useState("");
  const [newScheduledEnd, setNewScheduledEnd] = useState("");

  const loadData = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const [ordersRes, metricsRes, techRes] = await Promise.all([
        workOrdersApi.list({
          search,
          status: statusFilter,
          priority: priorityFilter,
          page,
          limit: 8,
        }),
        workOrdersApi.getMetrics().catch(() => ({ success: false, metrics: null })),
        workOrdersApi.getTechnicians().catch(() => ({ success: false, technicians: [] })),
      ]);

      if (ordersRes.success) {
        setWorkOrders(ordersRes.workOrders);
        setTotalPages(ordersRes.totalPages);
      }

      if (metricsRes.success && metricsRes.metrics) {
        setMetrics(metricsRes.metrics);
      }

      if (techRes.success && techRes.technicians) {
        setTechnicians(techRes.technicians);
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to load operational data", "error");
    } finally {
      setLoadingOrders(false);
    }
  }, [search, statusFilter, priorityFilter, page, showToast]);

  useEffect(() => {
    let isMounted = true;
    authApi
      .getMe()
      .then((res) => {
        if (isMounted) {
          dispatch(setCurrentUser(res.user));
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          router.replace("/login");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [router, dispatch]);

  useEffect(() => {
    if (user) {
      const loadTimer = window.setTimeout(() => void loadData(), 0);

      let eventSource: EventSource | null = null;
      try {
        eventSource = new EventSource("/api/realtime", {
          withCredentials: true,
        });

        eventSource.addEventListener("work-order:created", () => {
          loadData();
        });

        eventSource.addEventListener("work-order:updated", () => {
          loadData();
        });

        eventSource.addEventListener("progress-event:created", () => {
          loadData();
        });
      } catch {
      }

      return () => {
        window.clearTimeout(loadTimer);
        if (eventSource) eventSource.close();
      };
    }
  }, [user, loadData, router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await authApi.logout();
      dispatch(setCurrentUser(null));
      showToast("Signed out successfully", "info");
    } catch {
    } finally {
      router.replace("/login");
    }
  };

  const handleCreateWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSiteName.trim()) {
      showToast("Please fill in the title and site name", "error");
      return;
    }

    setCreating(true);
    try {
      const res = await workOrdersApi.create({
        title: newTitle.trim(),
        description: newDescription.trim() || newTitle.trim(),
        siteName: newSiteName.trim(),
        priority: newPriority,
        assignedTechnicianId: newTechnicianId || null,
        scheduledStart: newScheduledStart ? new Date(newScheduledStart).toISOString() : null,
        scheduledEnd: newScheduledEnd ? new Date(newScheduledEnd).toISOString() : null,
      });

      showToast(`Work order ${res.workOrder.referenceNumber} created`, "success");
      setIsCreateModalOpen(false);
      setNewTitle("");
      setNewDescription("");
      setNewSiteName("");
      setNewPriority("MEDIUM");
      setNewTechnicianId("");
      setNewScheduledStart("");
      setNewScheduledEnd("");
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to create work order", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      if (user?.role === "TECHNICIAN") {
        const response = await fetch("/api/progress-events", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: crypto.randomUUID(), workOrderId: orderId, type: "status_changed", occurredAt: new Date().toISOString(), payload: { status: newStatus } }) });
        if (!response.ok) { const result = await response.json(); throw new Error(result.message || "Could not submit status update"); }
      } else {
        await workOrdersApi.update(orderId, { status: newStatus });
      }
      showToast(`Status updated to ${newStatus.replace("_", " ")}`, "success");
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to update status", "error");
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-app)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", border: "2px solid var(--accent)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
          <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Initializing tenant session...</span>
          <button
            type="button"
            onClick={() => {
              router.push("/login");
            }}
            style={{
              marginTop: "8px",
              background: "transparent",
              border: "none",
              color: "var(--accent)",
              fontSize: "0.78rem",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Return to Sign In
          </button>
        </div>
      </div>
    );
  }

  const roleClass =
    user?.role === "OWNER"
      ? "role-owner"
      : user?.role === "DISPATCHER"
      ? "role-dispatcher"
      : "role-technician";

  const orgId = user?.organisationId || "";
  const orgName = user?.organisation?.name || orgId;

  const isOwner = user?.role === "OWNER";
  const isDispatcher = user?.role === "DISPATCHER" || isOwner;

  const initials = (user?.name || user?.email || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="layout-wrapper">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-badge">
            <span className="brand-badge-dot"></span>
            FieldDesk Ops
          </div>

          <div className="tenant-selector">
            <span className="tenant-dot"></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {orgName}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                {orgId}
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar-content">
          <div>
            <div className="nav-group-title">Field Management</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div
                className={`nav-item ${activeTab === "overview" ? "active" : ""}`}
                onClick={() => setActiveTab("overview")}
              >
                <div className="nav-item-content">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                  </svg>
                  <span>Overview</span>
                </div>
              </div>

              <div
                className={`nav-item ${activeTab === "orders" ? "active" : ""}`}
                onClick={() => setActiveTab("orders")}
              >
                <div className="nav-item-content">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                  <span>Work Orders</span>
                </div>
                <span className="nav-count">{metrics.total}</span>
              </div>

              <div
                className={`nav-item ${activeTab === "security" ? "active" : ""}`}
                onClick={() => setActiveTab("security")}
              >
                <div className="nav-item-content">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                  <span>Isolation & RBAC</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="nav-group-title">Organisation Controls</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div
                className="nav-item"
                style={{ opacity: isOwner ? 1 : 0.45, cursor: isOwner ? "pointer" : "not-allowed" }}
                title={isOwner ? "Organisation Settings" : "Requires OWNER role"}
                onClick={() => { if (isOwner) router.push("/admin"); }}
              >
                <div className="nav-item-content">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                  <span>Admin settings</span>
                </div>
                {!isOwner && <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Locked</span>}
              </div>

              <div
                className="nav-item"
                style={{ opacity: isDispatcher ? 1 : 0.45, cursor: isDispatcher ? "pointer" : "not-allowed" }}
                title={isDispatcher ? "Dispatcher Hub" : "Requires DISPATCHER or OWNER role"}
              >
                <div className="nav-item-content">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                  </svg>
                  <span>Technicians ({technicians.length})</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="user-profile-card">
            <div className="avatar">{initials}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "0.825rem", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.name || user?.email}
              </div>
              <div style={{ display: "flex", marginTop: "3px" }}>
                <span className={`role-pill ${roleClass}`} style={{ fontSize: "0.65rem", padding: "1px 6px" }}>
                  {user?.role}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleLogout}
            disabled={loggingOut}
            style={{ width: "100%", justifyContent: "center", fontSize: "0.8rem", padding: "8px 12px" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            {loggingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </aside>

      <main className="main-view">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Tenant</span>
            <span style={{ color: "var(--border-medium)" }}>/</span>
            <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--text-primary)" }}>{orgName}</span>
            <span style={{ color: "var(--border-medium)" }}>/</span>
            <span style={{ fontSize: "0.85rem", color: "var(--accent)", textTransform: "capitalize" }}>{activeTab}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", padding: "4px 10px", borderRadius: "6px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80" }}></span>
              Database Isolation Active
            </div>

            {isDispatcher && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setIsCreateModalOpen(true)}
                style={{ width: "auto", margin: 0, padding: "7px 14px", fontSize: "0.825rem" }}
              >
                + Create Work Order
              </button>
            )}
          </div>
        </header>

        <div className="content-body">
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Total Work Orders</span>
              <span className="metric-value">{metrics.total}</span>
              <span className="metric-sub">Scoped to {orgName}</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">In Progress</span>
              <span className="metric-value" style={{ color: "#2dd4bf" }}>
                {metrics.inProgress}
              </span>
              <span className="metric-sub">Active field assignments</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Urgent / High Priority</span>
              <span className="metric-value" style={{ color: "var(--warning-text)" }}>
                {metrics.highPriority}
              </span>
              <span className="metric-sub">Requires monitoring</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Completed Orders</span>
              <span className="metric-value" style={{ color: "var(--success-text)" }}>
                {metrics.completed}
              </span>
              <span className="metric-sub">Archived audit records</span>
            </div>
          </div>

          {(activeTab === "overview" || activeTab === "orders") && (
            <div className="card-panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Work Orders Register</h2>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                    Live records from database with concurrency conflict protection.
                  </p>
                </div>
                {user && <button className="btn-secondary" disabled={exporting} onClick={async () => {
                  setExporting(true);
                  try {
                    const params = new URLSearchParams({ search, status: statusFilter, priority: priorityFilter });
                    const response = await fetch(`/api/work-orders/export?${params}`, { credentials: "include" });
                    if (!response.ok) throw new Error("CSV export failed");
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "fielddesk-work-orders.csv";
                    link.click();
                    URL.revokeObjectURL(url);
                  } catch (error) { showToast(error instanceof Error ? error.message : "CSV export failed", "error"); }
                  finally { setExporting(false); }
                }}>{exporting ? "Preparing CSV…" : "Export CSV"}</button>}
              </div>

              <div className="filter-bar">
                <div className="filter-inputs">
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search reference, title, site..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />

                  <select
                    className="select-filter"
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>

                  <select
                    className="select-filter"
                    value={priorityFilter}
                    onChange={(e) => {
                      setPriorityFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">All Priorities</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Ref #</th>
                      <th>Task / Description</th>
                      <th>Site Location</th>
                      <th>Technician</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Update Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingOrders ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                          Loading work orders from database...
                        </td>
                      </tr>
                    ) : workOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                          No work orders found matching the filter.
                        </td>
                      </tr>
                    ) : (
                      workOrders.map((order) => {
                        const statusClass =
                          order.status === "COMPLETED"
                            ? "status-completed"
                            : order.status === "IN_PROGRESS"
                            ? "status-in-progress"
                            : "status-scheduled";

                        const priorityClass =
                          order.priority === "HIGH" || order.priority === "URGENT"
                            ? "priority-high"
                            : order.priority === "MEDIUM"
                            ? "priority-medium"
                            : "priority-low";

                        return (
                          <tr key={order.id}>
                            <td>
                              <a href={`/work-orders/${order.id}`} style={{ fontSize: "0.78rem", color: "var(--accent)" }}>
                                {order.referenceNumber}
                              </a>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{order.title}</div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {order.description}
                              </div>
                            </td>
                            <td style={{ color: "var(--text-secondary)" }}>{order.siteName}</td>
                            <td>
                              {order.assignedTechnician ? (
                                <span>{order.assignedTechnician.name}</span>
                              ) : (
                                <span style={{ color: "var(--text-muted)" }}>Unassigned</span>
                              )}
                            </td>
                            <td>
                              <span className={`priority-badge ${priorityClass}`}>
                                {order.priority}
                              </span>
                            </td>
                            <td>
                              <span className={`status-badge ${statusClass}`}>
                                {order.status.replace("_", " ")}
                              </span>
                            </td>
                            <td>
                              <select
                                className="select-filter"
                                style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                                value={order.status}
                                onChange={(e) => handleStatusChange(order.id, e.target.value)}
                              >
                                <option value="PENDING">Pending</option>
                                <option value="IN_PROGRESS">In Progress</option>
                                <option value="COMPLETED">Completed</option>
                                <option value="CANCELLED">Cancelled</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="pagination-controls">
                <span>Page {page} of {totalPages}</span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    style={{ padding: "4px 10px", fontSize: "0.8rem", opacity: page <= 1 ? 0.5 : 1 }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    style={{ padding: "4px 10px", fontSize: "0.8rem", opacity: page >= totalPages ? 0.5 : 1 }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="card-panel">
              <h2 className="panel-title" style={{ marginBottom: "16px" }}>
                Role-Based Access Control (RBAC) & Tenant Scope
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "16px" }}>
                  <div style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "8px", fontWeight: 600 }}>Active Role Permissions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.825rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Organisation Settings:</span>
                      <strong style={{ color: isOwner ? "var(--success-text)" : "var(--text-muted)" }}>{isOwner ? "Authorized" : "Denied"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Create Work Orders:</span>
                      <strong style={{ color: isDispatcher ? "var(--success-text)" : "var(--text-muted)" }}>{isDispatcher ? "Authorized" : "Denied"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Assign Technicians:</span>
                      <strong style={{ color: isDispatcher ? "var(--success-text)" : "var(--text-muted)" }}>{isDispatcher ? "Authorized" : "Denied"}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Update Status:</span>
                      <strong style={{ color: "var(--success-text)" }}>Authorized</strong>
                    </div>
                  </div>
                </div>

                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "16px" }}>
                  <div style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "8px", fontWeight: 600 }}>Cryptographic Parameters</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.825rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Tenant ID:</span>
                      <code>{orgId}</code>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>User ID:</span>
                      <code>{user?.id}</code>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Storage Type:</span>
                      <span style={{ color: "var(--success-text)" }}>HTTP-Only Signed Cookie</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {isCreateModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Create Work Order</h2>
              <button
                type="button"
                className="toast-close-btn"
                onClick={() => setIsCreateModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateWorkOrder}>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Chiller Compressor Overhaul"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: "70px", resize: "vertical" }}
                  placeholder="Task details and scope..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Site Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Tech Hub Building 4"
                    value={newSiteName}
                    onChange={(e) => setNewSiteName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select
                    className="form-input"
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as "LOW" | "MEDIUM" | "HIGH" | "URGENT")}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Assign Technician</label>
                <select
                  className="form-input"
                  value={newTechnicianId}
                  onChange={(e) => setNewTechnicianId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name} ({tech.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Scheduled Start</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={newScheduledStart}
                    onChange={(e) => setNewScheduledStart(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Scheduled End</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={newScheduledEnd}
                    onChange={(e) => setNewScheduledEnd(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: "auto", margin: 0 }}
                  disabled={creating}
                >
                  {creating ? "Creating..." : "Save Work Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
