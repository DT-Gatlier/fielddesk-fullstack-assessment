"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { IconAlert, IconClock, IconLocation, IconWorkOrders } from "@/components/Icons";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import {
  getDashboardSummary,
  getMe,
  listWorkOrders,
  type AuthUser,
  type DashboardSummary,
  type WorkOrder,
} from "@/lib/api";
import { formatScheduleWindow, formatStatus, isOverdue, isScheduledToday } from "@/lib/format";
import { connectRealtime } from "@/lib/realtime";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    const [meResult, summaryResult, ordersResult] = await Promise.all([
      getMe(),
      getDashboardSummary(),
      listWorkOrders({ page: "1", pageSize: "10" }),
    ]);

    if (!meResult) {
      router.replace("/login");
      return null;
    }

    setUser(meResult.user);
    setSummary(summaryResult.summary);
    setRecentOrders(ordersResult.items);
    return meResult.user;
  }

  useEffect(() => {
    loadData()
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!user) return;

    const refresh = () => {
      void loadData().catch(() => {
        // Real-time is best-effort.
      });
    };

    return connectRealtime(refresh, refresh);
  }, [user]);

  const metrics = useMemo(() => {
    if (!summary) return null;

    const draft = summary.byStatus.draft ?? 0;
    const scheduled = summary.byStatus.scheduled ?? 0;
    const inProgress = summary.byStatus.in_progress ?? 0;
    const completed = summary.byStatus.completed ?? 0;
    const needsAttention = draft + inProgress;
    const activeToday = recentOrders.filter(
      (order) => isScheduledToday(order.scheduledStart) && order.status !== "completed" && order.status !== "cancelled",
    ).length;
    const overdueCount = recentOrders.filter(isOverdue).length;

    return { draft, scheduled, inProgress, completed, needsAttention, activeToday, overdueCount };
  }, [summary, recentOrders]);

  if (loading) {
    return (
      <div className="app-main">
        <LoadingScreen message="Loading operations overview…" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="public-page">
        <div className="public-page__inner">
          <Alert variant="error">{error ?? "Not signed in"}</Alert>
          <Link href="/login" className="btn btn--primary">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  const isTechnician = user.role === "technician";

  return (
    <AppShell user={user}>
      <PageHeader
        eyebrow="Operations overview"
        title={isTechnician ? "Your field work" : "Command center"}
        description={
          isTechnician
            ? "Track assigned jobs, schedules, and status updates."
            : "Monitor work orders, scheduling, and jobs requiring attention."
        }
        actions={
          <>
            {(user.role === "owner" || user.role === "dispatcher") ? (
              <Link href="/work-orders/new" className="btn btn--primary">
                New work order
              </Link>
            ) : null}
            <Link href="/work-orders" className="btn btn--secondary">
              All work orders
            </Link>
          </>
        }
      />

      <div className="dashboard-grid">
        {metrics ? (
          <div className="panel-grid panel-grid--stats">
            <StatTile
              label="Needs attention"
              value={metrics.needsAttention}
              hint={`${metrics.draft} unassigned · ${metrics.inProgress} in progress`}
              variant="attention"
              icon={<IconAlert size={14} />}
            />
            <StatTile
              label="Scheduled"
              value={metrics.scheduled}
              hint="Awaiting field execution"
              variant="default"
              icon={<IconClock size={14} />}
            />
            <StatTile
              label="In progress"
              value={metrics.inProgress}
              hint="Technicians actively working"
              variant="active"
            />
            <StatTile
              label="Completed"
              value={metrics.completed}
              hint={`${summary?.total ?? 0} total in system`}
              variant="success"
            />
          </div>
        ) : null}

        {metrics && (metrics.activeToday > 0 || metrics.overdueCount > 0) ? (
          <div className="panel panel__body" style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
            {metrics.activeToday > 0 ? (
              <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
                <strong>{metrics.activeToday}</strong> job{metrics.activeToday === 1 ? "" : "s"} scheduled today
              </span>
            ) : null}
            {metrics.overdueCount > 0 ? (
              <Badge value="overdue" variant="overdue" />
            ) : null}
            {metrics.overdueCount > 0 ? (
              <span style={{ fontSize: "0.875rem", color: "var(--color-error)" }}>
                {metrics.overdueCount} overdue in recent list
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="dashboard-section">
          <div className="dashboard-section__header">
            <span className="dashboard-section__title">Recent work orders</span>
            <Link href="/work-orders" className="dashboard-section__link">
              View all →
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <EmptyState
              icon={<IconWorkOrders size={24} />}
              title="No work orders yet"
              description={
                isTechnician
                  ? "You have no assigned work orders at the moment."
                  : "Create your first work order to start scheduling field work."
              }
              action={
                !isTechnician ? (
                  <Link href="/work-orders/new" className="btn btn--primary">
                    Create work order
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="data-table-wrap" style={{ border: "none", borderRadius: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Work order</th>
                    <th>Site</th>
                    <th>Schedule</th>
                    <th>Status</th>
                    <th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link href={`/work-orders/${order.id}`} className="data-table__link">
                          <span className="data-table__ref">{order.referenceNumber}</span>
                          <span className="data-table__title">{order.title}</span>
                        </Link>
                      </td>
                      <td>
                        <span className="data-table__meta">
                          <IconLocation size={14} />
                          {order.siteName}
                        </span>
                      </td>
                      <td>
                        <span className="data-table__schedule">
                          {formatScheduleWindow(order.scheduledStart, order.scheduledEnd)}
                        </span>
                      </td>
                      <td>
                        <div className="data-table__badges">
                          <Badge value={order.status} variant="status" />
                          {isOverdue(order) ? <Badge value="overdue" variant="overdue" /> : null}
                        </div>
                      </td>
                      <td>
                        <Badge value={order.priority} variant="priority" showDot={false} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {summary ? (
          <div className="dashboard-section">
            <div className="dashboard-section__header">
              <span className="dashboard-section__title">Status breakdown</span>
            </div>
            <div className="panel__body" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {Object.entries(summary.byStatus).map(([status, count]) => (
                <Link
                  key={status}
                  href={`/work-orders?status=${status}`}
                  className="btn btn--ghost btn--sm"
                  style={{ textTransform: "capitalize" }}
                >
                  {formatStatus(status)} ({count})
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
