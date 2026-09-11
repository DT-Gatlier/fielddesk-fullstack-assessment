"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PageHeader } from "@/components/PageHeader";
import {
  downloadWorkOrdersCsv,
  getMe,
  listWorkOrders,
  type AuthUser,
  type WorkOrder,
} from "@/lib/api";
import { connectRealtime } from "@/lib/realtime";

export default function WorkOrdersPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);

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
    if (!user) {
      return;
    }
    return connectRealtime(() => void load(), () => void load());
  }, [user, load]);

  const canExport = user?.role === "owner" || user?.role === "dispatcher" || user?.role === "technician";

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
      <PageHeader
        title="Work orders"
        description={`${total} total · ${user.role === "technician" ? "showing your assignments" : "organisation-wide view"}`}
      />

      <div className="card filters">
        <label className="field-label">
          Search
          <input
            placeholder="Title, reference, site…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="field-label">
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
        <div className="filters__actions">
          <button type="button" className="btn btn--primary" onClick={() => void load()}>
            Apply filters
          </button>
          {canExport ? (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
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

      {loading ? <LoadingScreen message="Refreshing list…" /> : null}

      {!loading && items.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state__icon" aria-hidden>
            📋
          </div>
          <p>No work orders match your filters.</p>
          {user.role === "owner" || user.role === "dispatcher" ? (
            <Link href="/work-orders/new" className="btn btn--primary">
              Create work order
            </Link>
          ) : null}
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <ul className="work-order-list">
          {items.map((item) => (
            <li key={item.id} className="card work-order-card">
              <div className="list-row">
                <div>
                  <Link href={`/work-orders/${item.id}`} className="work-order-card__link">
                    <div className="work-order-card__title">
                      <span className="work-order-card__ref">{item.referenceNumber}</span>
                      {" · "}
                      {item.title}
                    </div>
                    <p className="work-order-card__meta">{item.siteName}</p>
                  </Link>
                </div>
                <div className="badges">
                  <Badge value={item.status} variant="status" />
                  <Badge value={item.priority} variant="priority" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </AppShell>
  );
}
