"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { IconDownload, IconLocation, IconSearch, IconWorkOrders } from "@/components/Icons";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PageHeader } from "@/components/PageHeader";
import {
  downloadWorkOrdersCsv,
  getMe,
  listWorkOrders,
  type AuthUser,
  type WorkOrder,
} from "@/lib/api";
import { formatScheduleWindow, isOverdue } from "@/lib/format";
import { connectRealtime } from "@/lib/realtime";

function WorkOrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setStatus(searchParams.get("status") ?? "");
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await getMe();
      if (!me) {
        router.replace("/login");
        return;
      }
      setUser(me.user);

      const params: Record<string, string> = { page: "1", pageSize: "20" };
      if (search) params.search = search;
      if (status) params.status = status;

      const result = await listWorkOrders(params);
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load work orders");
    } finally {
      setLoading(false);
    }
  }, [router, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    return connectRealtime(() => void load(), () => void load());
  }, [user, load]);

  const canExport =
    user?.role === "owner" || user?.role === "dispatcher" || user?.role === "technician";
  const canCreate = user?.role === "owner" || user?.role === "dispatcher";

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (status) params.status = status;
      await downloadWorkOrdersCsv(params);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (!user && loading) {
    return (
      <div className="app-main">
        <LoadingScreen message="Loading work orders…" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <AppShell user={user}>
      <div className="work-orders-page">
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Work orders" },
        ]}
        title="Work orders"
        description={`${total} total · ${user.role === "technician" ? "your assignments" : "organisation-wide view"}`}
        actions={
          canCreate ? (
            <Link href="/work-orders/new" className="btn btn--primary">
              New work order
            </Link>
          ) : undefined
        }
      />

      <div className="filters-toolbar">
        <div className="filters-toolbar__fields">
          <label className="field-label field-label--search">
            Search
            <div className="input-with-icon">
              <IconSearch />
              <input
                placeholder="Title, reference, site…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void load();
                }}
              />
            </div>
          </label>
          <label className="field-label field-label--status">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>
        <div className="filters-toolbar__actions">
          <button type="button" className="btn btn--primary" onClick={() => void load()}>
            Apply
          </button>
          {canExport ? (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              <IconDownload size={16} />
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {loading ? <LoadingScreen variant="skeleton" message="Refreshing list…" rows={6} /> : null}

      {!loading && items.length === 0 ? (
        <div className="panel panel__body">
          <EmptyState
            icon={<IconWorkOrders size={24} />}
            title="No work orders found"
            description={
              search || status
                ? "Try adjusting your search or filter criteria."
                : "Create a work order to begin scheduling field work."
            }
            action={
              canCreate ? (
                <Link href="/work-orders/new" className="btn btn--primary">
                  Create work order
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Job</th>
                  <th>Site</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/work-orders/${item.id}`} className="data-table__ref data-table__link">
                        {item.referenceNumber}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/work-orders/${item.id}`} className="data-table__link">
                        <span className="data-table__title">{item.title}</span>
                      </Link>
                    </td>
                    <td>
                      <span className="data-table__meta">
                        <IconLocation size={14} />
                        {item.siteName}
                      </span>
                    </td>
                    <td>
                      <span className="data-table__schedule">
                        {formatScheduleWindow(item.scheduledStart, item.scheduledEnd)}
                      </span>
                    </td>
                    <td>
                      <div className="data-table__badges">
                        <Badge value={item.status} variant="status" />
                        {isOverdue(item) ? <Badge value="overdue" variant="overdue" /> : null}
                      </div>
                    </td>
                    <td>
                      <Badge value={item.priority} variant="priority" showDot={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="work-order-cards">
            {items.map((item) => (
              <li key={item.id} className="work-order-card">
                <Link href={`/work-orders/${item.id}`} className="work-order-card__link">
                  <div className="work-order-card__header">
                    <div>
                      <div className="work-order-card__ref">{item.referenceNumber}</div>
                      <div className="work-order-card__title">{item.title}</div>
                    </div>
                    <div className="badges">
                      <Badge value={item.status} variant="status" />
                      {isOverdue(item) ? <Badge value="overdue" variant="overdue" /> : null}
                    </div>
                  </div>
                  <div className="work-order-card__meta">
                    <span className="work-order-card__meta-item">
                      <IconLocation size={14} />
                      {item.siteName}
                    </span>
                    <span className="work-order-card__meta-item">
                      {formatScheduleWindow(item.scheduledStart, item.scheduledEnd)}
                    </span>
                    <Badge value={item.priority} variant="priority" showDot={false} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      </div>
    </AppShell>
  );
}

export default function WorkOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="app-main">
          <LoadingScreen message="Loading work orders…" />
        </div>
      }
    >
      <WorkOrdersContent />
    </Suspense>
  );
}
