import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, toQuery } from '../api/client';
import { PRIORITIES, STATUSES, type Page, type WorkOrder } from '../api/types';
import { useAuth } from '../auth';
import { Icon } from '../components/icons';
import { Avatar, Button, EmptyState, ErrorBanner, Input, LoadingBlock, PageHeader, PRIORITY_EDGE, PriorityTag, Select, StatusBadge, buttonClass, cx } from '../components/ui';
import { useDebounced, useTechnicians } from '../hooks';
import { formatWindow, priorityLabel, statusLabel } from '../lib/format';
import { useRealtime } from '../realtime';

const SORTS = [
  { value: 'createdAt', label: 'Created' },
  { value: 'updatedAt', label: 'Last updated' },
  { value: 'scheduledStart', label: 'Scheduled start' },
  { value: 'priority', label: 'Priority' },
  { value: 'reference', label: 'Reference' },
  { value: 'title', label: 'Title' },
  { value: 'status', label: 'Status' },
];

/** Filters live in the URL so a filtered view can be bookmarked, shared and survives refresh. */
export function WorkOrdersPage() {
  const { can, me } = useAuth();
  const { fallbackInterval } = useRealtime();
  const [params, setParams] = useSearchParams();
  const technicians = useTechnicians();

  const filters = {
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    priority: params.get('priority') ?? '',
    technicianId: params.get('technicianId') ?? '',
    sort: params.get('sort') ?? 'createdAt',
    order: params.get('order') ?? 'desc',
    page: Number(params.get('page') ?? '1') || 1,
    pageSize: Number(params.get('pageSize') ?? '20') || 20,
  };

  const [search, setSearch] = useState(filters.q);
  const debounced = useDebounced(search);
  useEffect(() => {
    if (debounced !== filters.q) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  function update(patch: Record<string, string | number>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === undefined) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page'); // any filter change returns to page 1
    setParams(next, { replace: true });
  }

  const apiQuery = toQuery({ ...filters, q: filters.q || undefined });
  const list = useQuery({
    queryKey: ['work-orders', apiQuery],
    queryFn: () => api<Page<WorkOrder>>(`/work-orders${apiQuery}`),
    placeholderData: keepPreviousData,
    refetchInterval: fallbackInterval,
  });

  const selectedStatuses = filters.status ? filters.status.split(',') : [];
  const toggleStatus = (s: string) => {
    const next = selectedStatuses.includes(s) ? selectedStatuses.filter((x) => x !== s) : [...selectedStatuses, s];
    update({ status: next.join(',') });
  };
  const hasFilters = !!(filters.q || filters.status || filters.priority || filters.technicianId);
  const exportQuery = toQuery({ q: filters.q || undefined, status: filters.status, priority: filters.priority, technicianId: filters.technicianId, sort: filters.sort, order: filters.order });
  const total = list.data?.meta.total;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work orders"
        description={
          <>
            {me?.user.role === 'technician' ? 'Jobs assigned to you.' : 'Search, filter and schedule your team’s jobs.'}
            {total !== undefined && <span className="tabular ml-2 inline-flex rounded-full bg-line-soft px-2 py-0.5 text-xs font-medium text-ink-soft">{total} total</span>}
          </>
        }
        actions={
          <>
            {can('workOrders:export') && (
              <a href={`/api/work-orders/export.csv${exportQuery}`} className={buttonClass('secondary')} download>
                <Icon name="download" />
                Export CSV
              </a>
            )}
            {can('workOrders:write') && (
              <Link to="/work-orders/new" className={buttonClass('primary')}>
                <Icon name="plus" />
                New work order
              </Link>
            )}
          </>
        }
      />

      <section aria-label="Filters" className="rounded-xl border border-line bg-panel shadow-card">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <label className="relative block">
            <span className="sr-only">Search</span>
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input type="search" placeholder="Search title, site or reference" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className="block">
            <span className="sr-only">Priority</span>
            <Select value={filters.priority} onChange={(e) => update({ priority: e.target.value })}>
              <option value="">Any priority</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{priorityLabel[p]}</option>)}
            </Select>
          </label>
          {can('users:read') && (
            <label className="block">
              <span className="sr-only">Technician</span>
              <Select value={filters.technicianId} onChange={(e) => update({ technicianId: e.target.value })}>
                <option value="">Any technician</option>
                <option value="unassigned">Unassigned</option>
                {technicians.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </label>
          )}
          <div className="flex gap-2">
            <Select aria-label="Sort by" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>Sort: {s.label}</option>)}
            </Select>
            <Button
              type="button"
              className="w-10 shrink-0 px-0"
              onClick={() => update({ order: filters.order === 'asc' ? 'desc' : 'asc' })}
              aria-label={`Order: ${filters.order === 'asc' ? 'ascending' : 'descending'}`}
              title={filters.order === 'asc' ? 'Ascending' : 'Descending'}
            >
              <Icon name={filters.order === 'asc' ? 'arrowUp' : 'arrowDown'} />
            </Button>
          </div>
        </div>
        <fieldset className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3">
          <legend className="sr-only">Status</legend>
          <span className="mr-1 text-xs font-medium text-ink-faint" aria-hidden>Status</span>
          {STATUSES.map((s) => {
            const on = selectedStatuses.includes(s);
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => toggleStatus(s)}
                className={cx(
                  'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                  on ? 'border-action/40 bg-action-tint text-action-strong' : 'border-line bg-panel text-ink-soft hover:border-ink-faint/50 hover:text-ink',
                )}>
                {on && <Icon name="check" className="h-3 w-3" />}
                {statusLabel[s]}
              </button>
            );
          })}
          {hasFilters && (
            <button type="button" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-action hover:text-action-strong" onClick={() => { setSearch(''); setParams(new URLSearchParams(), { replace: true }); }}>
              <Icon name="close" className="h-3 w-3" />
              Clear filters
            </button>
          )}
        </fieldset>
      </section>

      {list.isLoading ? (
        <LoadingBlock label="Loading work orders…" />
      ) : list.error ? (
        <ErrorBanner error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data?.data.length ? (
        <EmptyState title={hasFilters ? 'No work orders match these filters' : 'No work orders yet'} icon={hasFilters ? 'search' : 'clipboard'}>
          {hasFilters ? 'Try removing a filter or searching for something else.' : can('workOrders:write') ? 'Create the first one to start scheduling.' : 'Assigned jobs will appear here.'}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className={cx('overflow-hidden rounded-xl border border-line bg-panel shadow-card transition-opacity', list.isFetching && 'opacity-70')}>
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="border-b border-line bg-canvas/70 text-[11px] font-medium tracking-wider text-ink-faint uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Work order</th>
                  <th className="px-4 py-3 font-medium">Site</th>
                  <th className="px-4 py-3 font-medium">Technician</th>
                  <th className="px-4 py-3 font-medium">Scheduled</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {list.data.data.map((w) => (
                  <tr key={w.id} className="group transition-colors hover:bg-canvas/60">
                    <td className={cx('border-l-[3px] px-5 py-3.5', PRIORITY_EDGE[w.priority])}>
                      <Link to={`/work-orders/${w.id}`} className="font-medium text-ink group-hover:text-action-strong">{w.title}</Link>
                      <div className="mt-0.5 font-mono text-[11px] text-ink-faint">{w.reference}</div>
                    </td>
                    <td className="px-4 py-3.5 text-ink-soft">{w.siteName}</td>
                    <td className="px-4 py-3.5">
                      {w.technician ? (
                        <span className="inline-flex items-center gap-2"><Avatar name={w.technician.name} size="sm" />{w.technician.name}</span>
                      ) : (
                        <span className="text-ink-faint">Unassigned</span>
                      )}
                    </td>
                    <td className="tabular px-4 py-3.5 text-ink-soft">{formatWindow(w.scheduledStart, w.scheduledEnd)}</td>
                    <td className="px-4 py-3.5"><PriorityTag priority={w.priority} /></td>
                    <td className="px-5 py-3.5"><StatusBadge status={w.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line-soft md:hidden">
              {list.data.data.map((w) => (
                <li key={w.id} className={cx('border-l-[3px]', PRIORITY_EDGE[w.priority])}>
                  <Link to={`/work-orders/${w.id}`} className="block px-4 py-3.5 active:bg-canvas">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{w.title}</span>
                      <StatusBadge status={w.status} />
                    </div>
                    <div className="mt-1 text-xs text-ink-soft">
                      <span className="font-mono">{w.reference}</span> · {w.siteName}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-ink-soft">
                      <span className="inline-flex items-center gap-1.5"><Icon name="user" className="h-3 w-3 text-ink-faint" />{w.technician?.name ?? 'Unassigned'}</span>
                      <PriorityTag priority={w.priority} />
                    </div>
                    <div className="tabular mt-1 inline-flex items-center gap-1.5 text-xs text-ink-faint"><Icon name="calendar" className="h-3 w-3" />{formatWindow(w.scheduledStart, w.scheduledEnd)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Pagination meta={list.data.meta} onPage={(p) => update({ page: p })} onPageSize={(s) => update({ pageSize: s })} />
        </div>
      )}
    </div>
  );
}

function Pagination({ meta, onPage, onPageSize }: { meta: Page<WorkOrder>['meta']; onPage: (p: number) => void; onPageSize: (s: number) => void }) {
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Pagination">
      <span className="tabular text-ink-soft">
        Showing <span className="font-medium text-ink">{from}–{to}</span> of <span className="font-medium text-ink">{meta.total}</span>
      </span>
      <div className="flex items-center gap-2">
        <Select aria-label="Rows per page" className="h-8 w-auto text-[13px]" value={meta.pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} per page</option>)}
        </Select>
        <div className="flex items-center rounded-lg border border-line bg-panel shadow-xs">
          <button type="button" className="grid h-8 w-8 place-items-center rounded-l-lg text-ink-soft hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-40" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Previous">
            <Icon name="chevronLeft" />
          </button>
          <span className="tabular border-x border-line px-3 text-[13px] leading-8 whitespace-nowrap text-ink-soft">Page {meta.page} of {meta.totalPages}</span>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-r-lg text-ink-soft hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-40" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)} aria-label="Next">
            <Icon name="chevronRight" />
          </button>
        </div>
      </div>
    </nav>
  );
}
