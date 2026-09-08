"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getMe, listWorkOrders, type AuthUser, type WorkOrder } from "@/lib/api";

export default function WorkOrdersPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

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

  const canCreate = user?.role === "owner" || user?.role === "dispatcher";

  return (
    <main>
      <header className="page-header">
        <div>
          <h1>Work orders</h1>
          <p>{total} total</p>
        </div>
        <nav className="nav-links">
          <Link href="/dashboard">Dashboard</Link>
          {canCreate ? <Link href="/work-orders/new">New work order</Link> : null}
        </nav>
      </header>

      <div className="card filters">
        <input
          placeholder="Search title, reference, site…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button type="button" onClick={() => void load()}>Apply</button>
      </div>

      {loading ? <p>Loading…</p> : null}
      {error ? <p className="status-error">{error}</p> : null}

      {!loading && items.length === 0 ? (
        <div className="card empty-state">
          <p>No work orders found.</p>
          {canCreate ? <Link href="/work-orders/new">Create the first work order</Link> : null}
        </div>
      ) : null}

      <ul className="work-order-list">
        {items.map((item) => (
          <li key={item.id} className="card">
            <div className="list-row">
              <div>
                <Link href={`/work-orders/${item.id}`}>
                  <strong>{item.referenceNumber}</strong> — {item.title}
                </Link>
                <p>{item.siteName}</p>
              </div>
              <div className="badges">
                <span className="badge">{item.status}</span>
                <span className="badge">{item.priority}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
