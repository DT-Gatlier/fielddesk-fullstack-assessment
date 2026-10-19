import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatBytes, formatDateTime, label, type ActivityEntry, type Attachment, type WorkOrderDetail } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorBanner, Loading, PriorityBadge, StatusBadge } from '../components';

const TECHNICIAN_STATUSES = ['in_progress', 'on_hold', 'completed'] as const;

export function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const query = useQuery({
    queryKey: ['work-order', id],
    queryFn: () => api<{ data: WorkOrderDetail }>(`/api/work-orders/${id}`).then((r) => r.data),
  });

  if (query.isLoading) return <Loading what="Loading work order" />;
  if (query.error) return <ErrorBanner error={query.error} onRetry={() => void query.refetch()} />;
  const workOrder = query.data!;

  return (
    <section>
      <div className="page-header">
        <div>
          <div className="muted">{workOrder.reference}</div>
          <h1>{workOrder.title}</h1>
          <div className="row">
            <StatusBadge status={workOrder.status} /> <PriorityBadge priority={workOrder.priority} />
          </div>
        </div>
        {can('owner', 'dispatcher') && workOrder.status !== 'completed' && (
          <Link className="button" to={`/work-orders/${workOrder.id}/edit`}>
            Edit
          </Link>
        )}
      </div>

      <div className="detail-grid">
        <div className="card">
          <dl className="facts">
            <dt>Site</dt>
            <dd>{workOrder.siteName}</dd>
            <dt>Technician</dt>
            <dd>{workOrder.assignedTechnician?.name ?? 'Unassigned'}</dd>
            <dt>Scheduled</dt>
            <dd>
              {formatDateTime(workOrder.scheduledStart)} – {formatDateTime(workOrder.scheduledEnd)}
            </dd>
            <dt>Created</dt>
            <dd>
              {formatDateTime(workOrder.createdAt)} by {workOrder.createdBy.name}
            </dd>
            <dt>Updated</dt>
            <dd>{formatDateTime(workOrder.updatedAt)}</dd>
          </dl>
          {workOrder.description && <p className="description">{workOrder.description}</p>}
        </div>

        {can('technician') && <ProgressPanel workOrder={workOrder} />}
        <AttachmentsPanel workOrder={workOrder} />
      </div>

      <h2>Activity</h2>
      {workOrder.activity.length === 0 ? <Empty>No activity yet.</Empty> : <ActivityList entries={workOrder.activity} />}
    </section>
  );
}

function ProgressPanel({ workOrder }: { workOrder: WorkOrderDetail }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  // One eventId per intended action, reused if the request is retried, so a retry after a
  // timeout cannot apply the same update twice.
  const pending = useRef<{ key: string; eventId: string } | null>(null);

  const submit = useMutation({
    mutationFn: (input: { type: 'status_changed'; status: string } | { type: 'note_added' }) => {
      const key = JSON.stringify({ ...input, note });
      if (pending.current?.key !== key) pending.current = { key, eventId: `web-${crypto.randomUUID()}` };
      return api('/api/progress-events', {
        json: {
          eventId: pending.current.eventId,
          workOrderId: workOrder.id,
          type: input.type,
          occurredAt: new Date().toISOString(),
          payload: input.type === 'status_changed' ? { status: input.status, ...(note.trim() ? { note: note.trim() } : {}) } : { note: note.trim() },
        },
      });
    },
    onSuccess: () => {
      pending.current = null;
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['work-order', workOrder.id] });
      void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <div className="card">
      <h3>Progress update</h3>
      <ErrorBanner error={submit.error} />
      <textarea placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} />
      <div className="row wrap">
        {TECHNICIAN_STATUSES.filter((s) => s !== workOrder.status).map((status) => (
          <button
            key={status}
            disabled={submit.isPending || workOrder.status === 'completed'}
            onClick={() => submit.mutate({ type: 'status_changed', status })}
          >
            Mark {label(status).toLowerCase()}
          </button>
        ))}
        <button className="secondary" disabled={submit.isPending || !note.trim()} onClick={() => submit.mutate({ type: 'note_added' })}>
          Add note
        </button>
      </div>
    </div>
  );
}

function AttachmentsPanel({ workOrder }: { workOrder: WorkOrderDetail }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api<{ data: Attachment }>(`/api/work-orders/${workOrder.id}/attachments`, { form });
    },
    onSuccess: () => {
      if (input.current) input.current.value = '';
      void queryClient.invalidateQueries({ queryKey: ['work-order', workOrder.id] });
    },
  });

  return (
    <div className="card">
      <h3>Attachments</h3>
      {workOrder.attachments.length === 0 && <p className="muted">No attachments.</p>}
      <ul className="attachments">
        {workOrder.attachments.map((a) => (
          <li key={a.id}>
            <a href={a.downloadUrl}>{a.filename}</a>
            <span className="muted small">
              {formatBytes(a.sizeBytes)} · {a.uploadedBy.name} · {formatDateTime(a.createdAt)}
            </span>
          </li>
        ))}
      </ul>
      <ErrorBanner error={upload.error} />
      <label className="upload">
        <span>{upload.isPending ? 'Uploading…' : 'Add image or PDF'}</span>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
          }}
        />
      </label>
    </div>
  );
}

function describe(entry: ActivityEntry): string {
  const a = entry.after ?? {};
  const b = entry.before ?? {};
  switch (entry.action) {
    case 'work_order.created':
      return 'Created the work order';
    case 'work_order.assigned':
      return `Assigned to ${a.technicianName ?? 'a technician'}${b.technicianName ? ` (was ${b.technicianName})` : ''}`;
    case 'work_order.unassigned':
      return `Unassigned ${b.technicianName ?? ''}`.trim();
    case 'work_order.status_changed':
      return `Status ${label(String(b.status))} → ${label(String(a.status))}${a.note ? `: “${a.note}”` : ''}`;
    case 'work_order.note_added':
      return `Note: “${a.note}”`;
    case 'work_order.updated':
      return `Updated ${Object.keys(a).join(', ')}`;
    case 'work_order.progress_event_stale':
      return 'Recorded an out-of-order update (not applied)';
    case 'attachment.added':
      return `Attached ${a.filename}`;
    case 'notification.sent':
      return `Notified ${a.technicianName} (${a.attempts} attempt${a.attempts === 1 ? '' : 's'})`;
    case 'notification.failed':
      return `Notification to ${a.technicianName} failed after ${a.attempts} attempt(s): ${a.error}`;
    default:
      return label(entry.action.replace('.', ' '));
  }
}

function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  return (
    <ol className="activity">
      {entries.map((entry) => (
        <li key={entry.id}>
          <div>{describe(entry)}</div>
          <div className="muted small">
            {entry.actor.type === 'system' ? 'System' : entry.actor.name} · {formatDateTime(entry.createdAt)}
          </div>
        </li>
      ))}
    </ol>
  );
}
