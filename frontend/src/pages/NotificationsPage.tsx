import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, ErrorState, LoadingState } from '../components/Feedback';
import { Button } from '../components/FormControls';
import type { ApiResponse } from '../types';
import { formatDateTime, titleCase } from '../utils/format';

interface Notification { id: string; workOrderId: string; status: string; attemptCount: number; lastError: string | null; deliveredAt: string | null; createdAt: string }

export default function NotificationsPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['notifications'], queryFn: async () => (await apiFetch<ApiResponse<Notification[]>>('/notifications')).data, refetchInterval: 15_000 });
  const retry = useMutation({ mutationFn: (id: string) => apiFetch(`/notifications/${id}/retry`, { method: 'POST' }), onSuccess: () => void client.invalidateQueries({ queryKey: ['notifications'] }) });
  const columns: Column<Notification>[] = [
    { key: 'status', header: 'Status', render: (row) => <Badge tone={row.status === 'delivered' ? 'success' : row.status === 'permanent_failure' ? 'danger' : 'warning'}>{titleCase(row.status)}</Badge> },
    { key: 'workOrder', header: 'Work order ID', render: (row) => <code>{row.workOrderId.slice(0, 8)}…</code> },
    { key: 'attempts', header: 'Attempts', render: (row) => row.attemptCount },
    { key: 'created', header: 'Created', render: (row) => formatDateTime(row.createdAt) },
    { key: 'error', header: 'Last outcome', render: (row) => row.lastError ?? (row.deliveredAt ? `Delivered ${formatDateTime(row.deliveredAt)}` : 'Awaiting delivery') },
    { key: 'actions', header: '', render: (row) => row.status === 'permanent_failure' ? <Button variant="ghost" busy={retry.isPending && retry.variables === row.id} onClick={() => retry.mutate(row.id)}>Retry</Button> : null }
  ];
  return <div className="page"><header className="page-header"><div><p className="eyebrow">Operations</p><h1>Notifications</h1><p>Monitor assignment delivery and retry permanent failures.</p></div></header><section className="panel table-panel">{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <DataTable columns={columns} rows={query.data ?? []} rowKey={(row) => row.id} emptyTitle="No notifications yet" emptyMessage="Assignment notification jobs will appear here." />}</section></div>;
}
