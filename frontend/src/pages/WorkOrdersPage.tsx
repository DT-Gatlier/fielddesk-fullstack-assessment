import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, formatDateTime, label, PRIORITIES, STATUSES, type Page, type User, type WorkOrder } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorBanner, Loading, PriorityBadge, StatusBadge } from '../components';
import { useFallbackPolling } from '../realtime';

const SORTS = [
  ['created_at', 'Created'],
  ['updated_at', 'Updated'],
  ['scheduled_start', 'Scheduled'],
  ['priority', 'Priority'],
  ['status', 'Status'],
  ['reference', 'Reference'],
  ['title', 'Title'],
] as const;

const FILTER_KEYS = ['q', 'status', 'priority', 'technicianId', 'sort', 'order'] as const;

export function WorkOrdersPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const refetchInterval = useFallbackPolling();

  const page = Number(params.get('page') ?? '1');
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Debounce free-text search so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== search) update({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const filterQuery = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) filterQuery.set(key, value);
  }
  const listQuery = new URLSearchParams(filterQuery);
  listQuery.set('page', String(page));
  listQuery.set('pageSize', '20');

  const list = useQuery({
    queryKey: ['work-orders', listQuery.toString()],
    queryFn: () => api<Page<WorkOrder>>(`/api/work-orders?${listQuery}`),
    placeholderData: keepPreviousData,
    refetchInterval,
  });
  const technicians = useQuery({
    queryKey: ['technicians'],
    queryFn: () => api<{ data: User[] }>('/api/users?role=technician').then((r) => r.data),
    enabled: can('owner', 'dispatcher'),
  });

  const pagination = list.data?.pagination;

  return (
    <section>
      <div className="page-header">
        <h1>Work orders</h1>
        <div className="row">
          <a className="button secondary" href={`/api/work-orders/export.csv?${filterQuery}`} download>
            Export CSV
          </a>
          {can('owner', 'dispatcher') && (
            <Link className="button" to="/work-orders/new">
              New work order
            </Link>
          )}
        </div>
      </div>

      <div className="filters" role="search">
        <input
          type="search"
          placeholder="Search reference, title or site"
          aria-label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select aria-label="Status" value={params.get('status') ?? ''} onChange={(e) => update({ status: e.target.value || null })}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        <select aria-label="Priority" value={params.get('priority') ?? ''} onChange={(e) => update({ priority: e.target.value || null })}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {label(p)}
            </option>
          ))}
        </select>
        {can('owner', 'dispatcher') && (
          <select
            aria-label="Technician"
            value={params.get('technicianId') ?? ''}
            onChange={(e) => update({ technicianId: e.target.value || null })}
          >
            <option value="">All technicians</option>
            <option value="unassigned">Unassigned</option>
            {technicians.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Sort by" value={params.get('sort') ?? 'created_at'} onChange={(e) => update({ sort: e.target.value })}>
          {SORTS.map(([value, text]) => (
            <option key={value} value={value}>
              Sort: {text}
            </option>
          ))}
        </select>
        <button
          className="secondary"
          aria-label="Toggle sort direction"
          onClick={() => update({ order: params.get('order') === 'asc' ? 'desc' : 'asc' })}
        >
          {params.get('order') === 'asc' ? '↑ Asc' : '↓ Desc'}
        </button>
      </div>

      <ErrorBanner error={list.error} onRetry={() => void list.refetch()} />
      {list.isLoading && <Loading what="Loading work orders" />}
      {list.data && list.data.data.length === 0 && (
        <Empty>{filterQuery.toString() ? 'No work orders match these filters.' : 'No work orders yet.'}</Empty>
      )}

      {list.data && list.data.data.length > 0 && (
        <div className={`table-wrap${list.isFetching ? ' refreshing' : ''}`}>
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Site</th>
                <th>Technician</th>
                <th>Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {list.data.data.map((workOrder) => (
                <tr key={workOrder.id}>
                  <td data-label="Reference">
                    <Link to={`/work-orders/${workOrder.id}`}>{workOrder.reference}</Link>
                  </td>
                  <td data-label="Title">{workOrder.title}</td>
                  <td data-label="Status">
                    <StatusBadge status={workOrder.status} />
                  </td>
                  <td data-label="Priority">
                    <PriorityBadge priority={workOrder.priority} />
                  </td>
                  <td data-label="Site">{workOrder.siteName}</td>
                  <td data-label="Technician">{workOrder.assignedTechnician?.name ?? <span className="muted">Unassigned</span>}</td>
                  <td data-label="Scheduled">{formatDateTime(workOrder.scheduledStart)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.total > 0 && (
        <nav className="pagination" aria-label="Pagination">
          <button className="secondary" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
            Previous
          </button>
          <span>
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
          </span>
          <button
            className="secondary"
            disabled={page >= pagination.totalPages}
            onClick={() => update({ page: String(page + 1) })}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
