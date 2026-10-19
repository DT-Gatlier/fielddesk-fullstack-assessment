import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, formatDateTime, STATUSES, type Page, type Status, type WorkOrder } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorBanner, Loading, PriorityBadge, StatusBadge } from '../components';
import { useFallbackPolling } from '../realtime';

interface Summary {
  byStatus: Record<Status, number>;
  total: number;
  unassigned: number;
  overdue: number;
  today: number;
  urgent: number;
}

export function DashboardPage() {
  const { user } = useAuth();
  const refetchInterval = useFallbackPolling();
  const summary = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<{ data: Summary }>('/api/dashboard/summary').then((r) => r.data),
    refetchInterval,
  });
  const recent = useQuery({
    queryKey: ['work-orders', 'recent'],
    queryFn: () => api<Page<WorkOrder>>('/api/work-orders?sort=updated_at&order=desc&pageSize=6'),
    refetchInterval,
  });

  return (
    <section>
      <h1>{user?.role === 'technician' ? 'My work' : 'Dashboard'}</h1>
      <ErrorBanner error={summary.error} onRetry={() => void summary.refetch()} />
      {summary.isLoading && <Loading what="Loading summary" />}
      {summary.data && (
        <>
          <div className="stats">
            <Stat label="Total" value={summary.data.total} />
            <Stat label="Scheduled today" value={summary.data.today} />
            <Stat label="Overdue" value={summary.data.overdue} tone={summary.data.overdue ? 'warn' : undefined} />
            <Stat label="Urgent open" value={summary.data.urgent} tone={summary.data.urgent ? 'warn' : undefined} />
            {user?.role !== 'technician' && <Stat label="Unassigned" value={summary.data.unassigned} />}
          </div>
          <div className="status-strip">
            {STATUSES.map((status) => (
              <Link key={status} to={`/work-orders?status=${status}`} className="status-count">
                <StatusBadge status={status} /> <strong>{summary.data.byStatus[status]}</strong>
              </Link>
            ))}
          </div>
        </>
      )}

      <h2>Recently updated</h2>
      <ErrorBanner error={recent.error} onRetry={() => void recent.refetch()} />
      {recent.isLoading && <Loading />}
      {recent.data && recent.data.data.length === 0 && <Empty>No work orders yet.</Empty>}
      <ul className="cards">
        {recent.data?.data.map((workOrder) => (
          <li key={workOrder.id} className="card">
            <Link to={`/work-orders/${workOrder.id}`} className="card-title">
              {workOrder.reference} · {workOrder.title}
            </Link>
            <div className="row">
              <StatusBadge status={workOrder.status} /> <PriorityBadge priority={workOrder.priority} />
            </div>
            <div className="muted small">
              {workOrder.siteName} · {workOrder.assignedTechnician?.name ?? 'Unassigned'} · {formatDateTime(workOrder.scheduledStart)}
            </div>
            <div className="muted small">Updated {formatDateTime(workOrder.updatedAt)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label: text, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{text}</div>
    </div>
  );
}
