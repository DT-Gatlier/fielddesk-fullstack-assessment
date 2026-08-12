import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch, downloadFile } from '../../api/client';
import { DataTable, type Column } from '../../components/DataTable';
import { Badge, ErrorState, LoadingState } from '../../components/Feedback';
import { SelectInput, TextInput } from '../../components/FormControls';
import { Pagination } from '../../components/Pagination';
import { useAuth } from '../../context/AuthContext';
import type { ListResponse, WorkOrder } from '../../types';
import { formatDateTime, priorityTone, statusTone, titleCase } from '../../utils/format';

export default function WorkOrderListPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const queryString = params.toString();
  const query = useQuery({ queryKey: ['work-orders', queryString], queryFn: () => apiFetch<ListResponse<WorkOrder>>(`/work-orders?${queryString}`), placeholderData: (previous) => previous });
  const update = (name: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(name, value); else next.delete(name); if (name !== 'page') next.set('page', '1'); setParams(next); };
  const sort = params.get('sort') ?? 'createdAt';
  const direction = (params.get('direction') ?? 'desc') as 'asc' | 'desc';
  const filtersActive = Boolean(params.get('search') || params.get('status') || params.get('priority'));
  const columns: Column<WorkOrder>[] = [
    { key: 'referenceNumber', header: 'Work order', render: (row) => <div className="primary-cell"><Link to={`/work-orders/${row.id}`}>{row.title}</Link><span>{row.referenceNumber}</span></div> },
    { key: 'status', header: 'Status', sortable: true, render: (row) => <Badge tone={statusTone(row.status)}>{titleCase(row.status)}</Badge> },
    { key: 'priority', header: 'Priority', sortable: true, render: (row) => <Badge tone={priorityTone(row.priority)}>{titleCase(row.priority)}</Badge> },
    { key: 'scheduledStart', header: 'Schedule', sortable: true, render: (row) => <div className="primary-cell"><span>{formatDateTime(row.scheduledStart)}</span>{row.scheduledEnd && <small>to {formatDateTime(row.scheduledEnd)}</small>}</div> },
    { key: 'siteName', header: 'Site', render: (row) => row.siteName },
    { key: 'actions', header: '', render: (row) => <Link className="table-action" to={`/work-orders/${row.id}`}>View →</Link> }
  ];

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">Operations</p><h1>Work orders</h1><p>Search, schedule, and track field work.</p></div><div className="header-actions"><button className="button button--secondary" onClick={() => void downloadFile(`/reports/work-orders.csv?${new URLSearchParams([...params].filter(([key]) => ['search', 'status', 'priority'].includes(key))).toString()}`, 'work-orders.csv')}>Export CSV</button>{user?.role !== 'technician' && <Link className="button button--primary" to="/work-orders/new">+ New work order</Link>}</div></header>
    <section className="filter-bar">
      <TextInput label="Search" type="search" placeholder="Reference, title, or site" value={params.get('search') ?? ''} onChange={(event) => update('search', event.target.value)} />
      <SelectInput label="Status" value={params.get('status') ?? ''} onChange={(event) => update('status', event.target.value)}><option value="">All statuses</option>{['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'].map((item) => <option value={item} key={item}>{titleCase(item)}</option>)}</SelectInput>
      <SelectInput label="Priority" value={params.get('priority') ?? ''} onChange={(event) => update('priority', event.target.value)}><option value="">All priorities</option>{['low', 'medium', 'high', 'urgent'].map((item) => <option value={item} key={item}>{titleCase(item)}</option>)}</SelectInput>
      {filtersActive && <button className="button button--ghost clear-filters" onClick={() => setParams({})}>Clear filters</button>}
    </section>
    <section className="panel table-panel">
      {query.isLoading ? <LoadingState label="Loading work orders" /> : query.isError || !query.data ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <>
        <DataTable columns={columns} rows={query.data.data} rowKey={(row) => row.id} sort={sort} direction={direction} onSort={(key, nextDirection) => { const next = new URLSearchParams(params); next.set('sort', key); next.set('direction', nextDirection); setParams(next); }} emptyTitle={filtersActive ? 'No matching work orders' : 'No work orders yet'} emptyMessage={filtersActive ? 'Try changing or clearing your filters.' : 'Create a work order to start scheduling field work.'} />
        <Pagination {...query.data.meta} onPageChange={(page) => update('page', String(page))} />
      </>}
    </section>
  </div>;
}
