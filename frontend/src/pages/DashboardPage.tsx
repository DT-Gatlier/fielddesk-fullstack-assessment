import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { Badge } from '../components/Feedback';
import { ErrorState, LoadingState } from '../components/Feedback';
import { useAuth } from '../context/AuthContext';
import type { ApiResponse, DashboardData, WorkOrderStatus } from '../types';
import { formatBytes, formatDateTime, priorityTone, statusTone, titleCase } from '../utils/format';

const statuses: WorkOrderStatus[] = ['draft', 'scheduled', 'in_progress', 'completed'];

export default function DashboardPage() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['dashboard'], queryFn: async () => (await apiFetch<ApiResponse<DashboardData>>('/dashboard')).data, refetchInterval: 60_000 });
  if (query.isLoading) return <LoadingState label="Loading dashboard" />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const storagePercent = Math.min(100, query.data.storage.limitBytes ? query.data.storage.usedBytes / query.data.storage.limitBytes * 100 : 0);
  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">Overview</p><h1>Good day, {user?.name.split(' ')[0]}</h1><p>Here’s what needs attention across {user?.organisationName ?? 'your organisation'}.</p></div>{user?.role !== 'technician' && <Link className="button button--primary" to="/work-orders/new">+ New work order</Link>}</header>
    <section className="stats-grid">{statuses.map((status) => <Link to={`/work-orders?status=${status}`} className="stat-card" key={status}><span className={`stat-card__dot stat-card__dot--${status}`} /><div><p>{titleCase(status)}</p><strong>{query.data.statusCounts[status] ?? 0}</strong></div><span aria-hidden="true">→</span></Link>)}</section>
    <section className="dashboard-grid">
      <div className="panel panel--wide"><div className="panel__header"><div><h2>Upcoming work</h2><p>The next scheduled visits.</p></div><Link to="/work-orders">View all</Link></div>
        {query.data.upcoming.length ? <div className="upcoming-list">{query.data.upcoming.map((item) => <Link to={`/work-orders/${item.id}`} key={item.id} className="upcoming-item"><div className="date-tile"><strong>{new Date(item.scheduledStart!).getDate()}</strong><span>{new Date(item.scheduledStart!).toLocaleString(undefined, { month: 'short' })}</span></div><div className="upcoming-item__main"><strong>{item.title}</strong><span>{item.referenceNumber} · {item.siteName}</span></div><div><Badge tone={priorityTone(item.priority)}>{titleCase(item.priority)}</Badge><small>{formatDateTime(item.scheduledStart)}</small></div></Link>)}</div> : <p className="panel-empty">No upcoming work is scheduled.</p>}
      </div>
      <div className="panel"><div className="panel__header"><div><h2>Active priority</h2><p>Open work by urgency.</p></div></div><div className="priority-list">{Object.entries(query.data.priorityCounts).map(([priority, count]) => <div key={priority}><span><Badge tone={priorityTone(priority as never)}>{titleCase(priority)}</Badge></span><strong>{count}</strong></div>)}</div></div>
      <div className="panel"><div className="panel__header"><div><h2>Attachment storage</h2><p>Organisation usage.</p></div></div><div className="storage-number"><strong>{formatBytes(query.data.storage.usedBytes)}</strong><span>of {formatBytes(query.data.storage.limitBytes)}</span></div><div className="progress-bar"><span style={{ width: `${storagePercent}%` }} /></div><small>{storagePercent.toFixed(1)}% used</small></div>
      <div className="panel"><div className="panel__header"><div><h2>Quick view</h2><p>Current workflow state.</p></div></div><div className="status-list">{statuses.map((status) => <div key={status}><Badge tone={statusTone(status)}>{titleCase(status)}</Badge><strong>{query.data.statusCounts[status] ?? 0}</strong></div>)}</div></div>
    </section>
  </div>;
}
