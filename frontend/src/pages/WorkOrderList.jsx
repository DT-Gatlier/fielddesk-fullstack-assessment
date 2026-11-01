import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { EmptyState, ErrorBox, Loading, Pagination, PriorityBadge, StatusBadge } from "../components/ui.jsx";
import { PRIORITIES, STATUSES, canManage, fmt, label } from "../constants.js";
import { useFetch } from "../hooks/useFetch.js";
import { useLiveRefresh } from "../hooks/live.js";

const SORTS = [["reference", "Reference"], ["title", "Title"], ["priority", "Priority"], ["status", "Status"], ["start_at", "Start"], ["created_at", "Created"]];

export default function WorkOrderList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get("q") || "";
  const status = params.get("status") || "";
  const priority = params.get("priority") || "";
  const ordering = params.get("ordering") || "-created_at";
  const page = Number(params.get("page") || 1);

  const [q, setQ] = useState(search);
  const [exportError, setExportError] = useState(null);

  const update = (changes) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      Object.entries(changes).forEach(([k, v]) => (v === "" || v == null || (k === "page" && v === 1) ? n.delete(k) : n.set(k, v)));
      return n;
    });

  // debounce the search box (300ms) and reset to page 1
  useEffect(() => {
    const t = setTimeout(() => { if (q !== search) update({ q, page: 1 }); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filters = { search, status, priority };
  const { data, loading, error, reload } = useFetch(
    () => api.listOrders({ ...filters, ordering, page }),
    [search, status, priority, ordering, page]
  );
  useLiveRefresh(() => reload(true));

  const sortBy = (field) => update({ ordering: ordering === field ? `-${field}` : field, page: 1 });
  const arrow = (field) => (ordering === field ? "▲" : ordering === `-${field}` ? "▼" : "");

  async function exportCsv() {
    setExportError(null);
    try { await api.exportCsv({ ...filters, ordering }); } catch (e) { setExportError(e.message); }
  }

  const hasFilters = search || status || priority;

  return (
    <>
      <div className="page-head">
        <h1>Work orders</h1>
        {canManage(user) && (
          <div className="actions">
            <button onClick={exportCsv}>Export CSV</button>
            <Link className="button primary" to="/work-orders/new">New work order</Link>
          </div>
        )}
      </div>
      {exportError && <div className="banner error" role="alert">Export failed: {exportError}</div>}

      <div className="filters">
        <label>Search
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, title or site" />
        </label>
        <label>Status
          <select value={status} onChange={(e) => update({ status: e.target.value, page: 1 })}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </label>
        <label>Priority
          <select value={priority} onChange={(e) => update({ priority: e.target.value, page: 1 })}>
            <option value="">All</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Sort by
          <select value={ordering.replace("-", "")} onChange={(e) => update({ ordering: e.target.value, page: 1 })}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {hasFilters && <button className="link" onClick={() => { setQ(""); setParams({}); }}>Clear filters</button>}
      </div>

      {loading && !data ? <Loading /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
        <>
          {data.results.length === 0 ? (
            <EmptyState title={hasFilters ? "No work orders match these filters" : "No work orders yet"}>
              {hasFilters ? <p>Try removing a filter or searching for something else.</p>
                : canManage(user) ? <Link to="/work-orders/new">Create a work order</Link> : <p>Nothing has been assigned to you.</p>}
            </EmptyState>
          ) : (
            <table className="grid">
              <thead>
                <tr>
                  {SORTS.filter(([v]) => v !== "created_at").map(([v, l]) => (
                    <th key={v} aria-sort={ordering === v ? "ascending" : ordering === `-${v}` ? "descending" : "none"}>
                      <button className="link" onClick={() => sortBy(v)}>{l} {arrow(v)}</button>
                    </th>
                  ))}
                  <th>Site</th><th>Technician</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((o) => (
                  <tr key={o.id} tabIndex={0} onClick={() => nav(`/work-orders/${o.id}`)} onKeyDown={(e) => e.key === "Enter" && nav(`/work-orders/${o.id}`)}>
                    <td data-label="Reference"><Link to={`/work-orders/${o.id}`} onClick={(e) => e.stopPropagation()}>{o.reference}</Link></td>
                    <td data-label="Title">{o.title}</td>
                    <td data-label="Priority"><PriorityBadge priority={o.priority} /></td>
                    <td data-label="Status"><StatusBadge status={o.status} /></td>
                    <td data-label="Start">{fmt(o.start_at)}</td>
                    <td data-label="Site">{o.site_name}</td>
                    <td data-label="Technician">{o.technician_name || (o.technician ? `#${o.technician}` : "Unassigned")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.count > 0 && <Pagination page={page} count={data.count} onPage={(p) => update({ page: p })} />}
        </>
      )}
    </>
  );
}
