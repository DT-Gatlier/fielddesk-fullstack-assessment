import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { TECHNICIAN_SETTABLE, TRANSITIONS, type ActivityEntry, type Status, type WorkOrderDetail } from '../api/types';
import { useAuth } from '../auth';
import { Icon, type IconName } from '../components/icons';
import { Avatar, Button, EmptyState, ErrorBanner, Field, Input, LoadingBlock, Panel, PriorityTag, Select, StatusBadge, SuccessNote, Textarea, buttonClass, cx } from '../components/ui';
import { useTechnicians } from '../hooks';
import { activityLabel, formatBytes, formatDateTime, formatWindow, fromLocalInput, statusLabel, toLocalInput } from '../lib/format';
import { useRealtime } from '../realtime';

export function WorkOrderDetailPage() {
  const { id } = useParams() as { id: string };
  const { can, me } = useAuth();
  const { fallbackInterval } = useRealtime();
  const wo = useQuery({
    queryKey: ['work-order', id],
    queryFn: () => api<{ data: WorkOrderDetail }>(`/work-orders/${id}`).then((r) => r.data),
    refetchInterval: fallbackInterval,
  });

  if (wo.isLoading) return <LoadingBlock label="Loading work order…" />;
  if (wo.error) {
    return wo.error instanceof ApiError && wo.error.status === 404 ? (
      <EmptyState title="Work order not found" icon="search">
        It may have been reassigned, or it belongs to another organisation. <Link className="font-medium text-action underline underline-offset-2" to="/work-orders">Back to the list</Link>
      </EmptyState>
    ) : (
      <ErrorBanner error={wo.error} onRetry={() => void wo.refetch()} />
    );
  }
  const w = wo.data!;
  const closed = w.status === 'completed' || w.status === 'cancelled';
  const isTech = me?.user.role === 'technician';

  return (
    <div className="space-y-7">
      <div>
        <Link to="/work-orders" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" />
          Back to work orders
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-xs text-ink-soft shadow-xs">{w.reference}</span>
              <StatusBadge status={w.status} />
              <PriorityTag priority={w.priority} />
            </div>
            <h1 className="mt-3 text-[26px] leading-tight font-semibold tracking-tight break-words">{w.title}</h1>
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-ink-soft">
              <Icon name="pin" className="h-3.5 w-3.5 text-ink-faint" />
              {w.siteName}
            </p>
          </div>
          {can('workOrders:write') && !closed && (
            <Link to={`/work-orders/${w.id}/edit`} className={buttonClass('secondary')}>
              <Icon name="pencil" className="h-3.5 w-3.5" />
              Edit details
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Details" icon="file">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">{w.description || <span className="text-ink-faint">No description.</span>}</p>
            <dl className="mt-5 grid gap-px overflow-hidden rounded-lg border border-line-soft bg-line-soft text-sm sm:grid-cols-2">
              <Meta icon="calendar" label="Scheduled" value={formatWindow(w.scheduledStart, w.scheduledEnd)} />
              <Meta icon="user" label="Technician" value={w.technician?.name ?? 'Unassigned'} />
              <Meta icon="plus" label="Created" value={`${formatDateTime(w.createdAt)} by ${w.createdBy.name ?? 'unknown'}`} />
              <Meta icon="clock" label="Last updated" value={formatDateTime(w.updatedAt)} />
            </dl>
          </Panel>
          {isTech && !closed && <ProgressForm wo={w} />}
          {can('workOrders:write') && !closed && <StatusActions wo={w} />}
          <Attachments wo={w} canUpload={can('attachments:upload') && w.status !== 'cancelled'} />
          <Activity id={w.id} />
        </div>
        <div className="space-y-6">
          {can('workOrders:write') && !closed && <AssignmentPanel wo={w} />}
          {!isTech && <Notifications wo={w} />}
        </div>
      </div>
    </div>
  );
}

function Meta({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex gap-3 bg-panel px-4 py-3">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
      <div className="min-w-0">
        <dt className="text-xs text-ink-faint">{label}</dt>
        <dd className="tabular font-medium text-ink">{value}</dd>
      </div>
    </div>
  );
}

function useRefreshWorkOrder(id: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['work-order', id] });
    void qc.invalidateQueries({ queryKey: ['activity', id] });
    void qc.invalidateQueries({ queryKey: ['work-orders'] });
    void qc.invalidateQueries({ queryKey: ['summary'] });
  };
}

function AssignmentPanel({ wo }: { wo: WorkOrderDetail }) {
  const technicians = useTechnicians();
  const refresh = useRefreshWorkOrder(wo.id);
  const [technicianId, setTechnicianId] = useState(wo.technician?.id ?? '');
  const [start, setStart] = useState(toLocalInput(wo.scheduledStart));
  const [end, setEnd] = useState(toLocalInput(wo.scheduledEnd));
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTechnicianId(wo.technician?.id ?? '');
    setStart(toLocalInput(wo.scheduledStart));
    setEnd(toLocalInput(wo.scheduledEnd));
  }, [wo.technician?.id, wo.scheduledStart, wo.scheduledEnd]);

  const save = useMutation({
    mutationFn: () =>
      api(`/work-orders/${wo.id}/assignment`, {
        method: 'PUT',
        json: { technicianId: technicianId || null, scheduledStart: fromLocalInput(start), scheduledEnd: fromLocalInput(end), version: wo.version },
      }),
    onSuccess: () => {
      setSaved(true);
      refresh();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') refresh();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setLocalError(null);
    if (!!start !== !!end) return setLocalError('Set both a start and an end time.');
    if (start && end && new Date(end) <= new Date(start)) return setLocalError('End must be after the start.');
    if (technicianId && !start) return setLocalError('Schedule a time to assign a technician.');
    save.mutate();
  }

  const fieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : {};
  return (
    <Panel title="Assignment and schedule" icon="calendar" className="lg:sticky lg:top-20">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Technician">
          {(fid) => (
            <Select id={fid} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} disabled={technicians.isLoading}>
              <option value="">Unassigned</option>
              {technicians.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Start" error={fieldErrors.scheduledStart}>
          {(fid) => <Input id={fid} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />}
        </Field>
        <Field label="End" error={fieldErrors.scheduledEnd}>
          {(fid) => <Input id={fid} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />}
        </Field>
        {localError && <p role="alert" className="text-sm font-medium text-danger">{localError}</p>}
        {save.error && !Object.keys(fieldErrors).length && <ErrorBanner error={save.error} />}
        {saved && !save.isPending && <SuccessNote>Assignment saved.</SuccessNote>}
        <Button type="submit" variant="primary" busy={save.isPending} className="w-full">Save assignment</Button>
      </form>
    </Panel>
  );
}

function StatusActions({ wo }: { wo: WorkOrderDetail }) {
  const refresh = useRefreshWorkOrder(wo.id);
  const [note, setNote] = useState('');
  const change = useMutation({
    mutationFn: (status: Status) => api(`/work-orders/${wo.id}/status`, { method: 'POST', json: { status, note: note || undefined, version: wo.version } }),
    onSuccess: () => {
      setNote('');
      refresh();
    },
    onError: refresh,
  });
  const next = TRANSITIONS[wo.status];
  return (
    <Panel title="Update status" icon="check" description={`Currently ${statusLabel[wo.status].toLowerCase()}`}>
      <div className="space-y-3">
        <Input aria-label="Status note (optional)" placeholder="Add a note for the activity log (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        <div className="flex flex-wrap gap-2">
          {next.map((s) => (
            <Button key={s} type="button" variant={s === 'cancelled' ? 'danger' : 'secondary'} className={s === 'cancelled' ? 'sm:ml-auto' : undefined}
              busy={change.isPending && change.variables === s} onClick={() => change.mutate(s)}>
              {s === 'cancelled' ? 'Cancel work order' : `Mark ${statusLabel[s].toLowerCase()}`}
            </Button>
          ))}
        </div>
        {change.error && <ErrorBanner error={change.error} />}
      </div>
    </Panel>
  );
}

/**
 * Technician progress updates go through the idempotent progress-event API.
 * The eventId is generated once per update and reused for retries of that
 * same update, so a flaky connection can never apply it twice.
 */
function ProgressForm({ wo }: { wo: WorkOrderDetail }) {
  const refresh = useRefreshWorkOrder(wo.id);
  const options = TRANSITIONS[wo.status].filter((s) => TECHNICIAN_SETTABLE.includes(s));
  const [status, setStatus] = useState<string>('');
  const [note, setNote] = useState('');
  const eventId = useRef<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: () => {
      eventId.current ??= `evt-${crypto.randomUUID()}`;
      const body = status
        ? { type: 'status_changed', payload: { status, ...(note ? { note } : {}) } }
        : { type: 'note_added', payload: { note } };
      return api('/progress-events', {
        method: 'POST',
        json: { eventId: eventId.current, workOrderId: wo.id, occurredAt: new Date().toISOString(), ...body },
      });
    },
    onSuccess: () => {
      eventId.current = null;
      setStatus('');
      setNote('');
      setDone(true);
      refresh();
    },
    onError: (e) => {
      // A rejected update (validation/conflict) will not be retried as-is; start a fresh event next time.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) eventId.current = null;
    },
  });

  return (
    <Panel title="Progress update" icon="send" description="Let the office know how the job is going">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setDone(false); submit.mutate(); }}>
        <Field label="New status">
          {(fid) => (
            <Select id={fid} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">No change (note only)</option>
              {options.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Note">
          {(fid) => <Textarea id={fid} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="What did you do or find?" />}
        </Field>
        {submit.error && <ErrorBanner error={submit.error} onRetry={() => submit.mutate()} />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {done ? <SuccessNote>Update sent.</SuccessNote> : <span />}
          <Button type="submit" variant="primary" busy={submit.isPending} disabled={!status && !note.trim()}>
            <Icon name="send" className="h-3.5 w-3.5" />
            Send update
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Attachments({ wo, canUpload }: { wo: WorkOrderDetail; canUpload: boolean }) {
  const refresh = useRefreshWorkOrder(wo.id);
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api(`/work-orders/${wo.id}/attachments`, { method: 'POST', body: fd });
    },
    onSuccess: refresh,
    onSettled: () => {
      if (input.current) input.current.value = '';
    },
  });
  return (
    <Panel
      title={`Attachments (${wo.attachments.length})`}
      icon="paperclip"
      actions={canUpload && (
        <label className={cx(buttonClass('secondary', 'sm'), 'cursor-pointer focus-within:ring-2 focus-within:ring-action', upload.isPending && 'opacity-60')}>
          <Icon name="upload" className="h-3.5 w-3.5" />
          {upload.isPending ? 'Uploading…' : 'Upload file'}
          <input ref={input} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp,application/pdf"
            disabled={upload.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); }} />
        </label>
      )}
    >
      {upload.error && <div className="mb-3"><ErrorBanner error={upload.error} /></div>}
      {wo.attachments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-soft">No files yet. Photos (PNG, JPEG, WebP) and PDFs are accepted.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {wo.attachments.map((a) => (
            <li key={a.id}>
              <a href={a.downloadUrl} className="group flex items-center gap-3 rounded-lg border border-line-soft px-3 py-2.5 transition-colors hover:border-action/30 hover:bg-action-tint/40">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-line-soft text-ink-soft group-hover:bg-panel group-hover:text-action">
                  <Icon name="file" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink group-hover:text-action-strong">{a.filename}</span>
                  <span className="block truncate text-xs text-ink-faint">
                    {formatBytes(a.sizeBytes)} · {a.uploadedBy.name ?? 'unknown'} · {formatDateTime(a.createdAt)}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const NOTIFY_TEXT: Record<string, string> = {
  pending: 'Queued', enqueued: 'Sending', retrying: 'Retrying', delivered: 'Delivered', failed: 'Failed',
};
const NOTIFY_STYLE: Record<string, string> = {
  delivered: 'bg-ok-tint text-ok ring-ok/20',
  failed: 'bg-danger-tint text-danger ring-danger/20',
  retrying: 'bg-signal-tint text-[#8a5300] ring-signal/30',
};
function Notifications({ wo }: { wo: WorkOrderDetail }) {
  if (!wo.notifications.length) return null;
  return (
    <Panel title="Technician notifications" icon="bell">
      <ul className="space-y-3 text-sm">
        {wo.notifications.map((n) => (
          <li key={n.id} className="flex gap-3">
            <Avatar name={n.technicianName} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{n.technicianName}</span>
                <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', NOTIFY_STYLE[n.status] ?? 'bg-line-soft text-ink-soft ring-ink-faint/20')}>
                  {NOTIFY_TEXT[n.status]}{n.attempts > 1 ? ` after ${n.attempts} attempts` : ''}
                </span>
              </div>
              {n.lastError && n.status !== 'delivered' && <p className="mt-0.5 text-xs text-ink-faint">{n.lastError}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Activity({ id }: { id: string }) {
  const { fallbackInterval } = useRealtime();
  const activity = useQuery({
    queryKey: ['activity', id],
    queryFn: () => api<{ data: ActivityEntry[] }>(`/work-orders/${id}/activity`).then((r) => r.data),
    refetchInterval: fallbackInterval,
  });
  return (
    <Panel title="Activity" icon="pulse">
      {activity.isLoading ? (
        <LoadingBlock />
      ) : activity.error ? (
        <ErrorBanner error={activity.error} onRetry={() => void activity.refetch()} />
      ) : !activity.data?.length ? (
        <p className="text-sm text-ink-soft">No activity yet.</p>
      ) : (
        <ol className="relative space-y-5 pl-7 before:absolute before:top-2 before:bottom-2 before:left-[9px] before:w-px before:bg-line">
          {[...activity.data].reverse().map((a) => (
            <li key={a.id} className="relative text-sm">
              <span
                className={cx(
                  'absolute top-1 -left-7 h-[19px] w-[19px] rounded-full border-4 border-panel ring-1',
                  a.actor.type === 'system' ? 'bg-ink-faint ring-line' : 'bg-action ring-action/25',
                )}
                aria-hidden
              />
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p>
                  <span className="font-medium">{a.actor.name ?? 'System'}</span> {activityLabel(a.action)}
                </p>
                <p className="tabular text-xs text-ink-faint">{formatDateTime(a.createdAt)}</p>
              </div>
              <ActivityDetail a={a} />
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function ActivityDetail({ a }: { a: ActivityEntry }) {
  const before = a.before ?? {};
  const after = a.after ?? {};
  const note = (a.metadata?.note as string | undefined) ?? ((after as { payload?: { note?: string } }).payload?.note);
  const lines: string[] = [];
  if (a.action === 'work_order.status_changed') lines.push(`${statusLabel[before.status as Status] ?? before.status} → ${statusLabel[after.status as Status] ?? after.status}`);
  if (a.action === 'work_order.updated') lines.push(Object.keys(after).map((k) => `${k} changed`).join(', '));
  if (a.action === 'work_order.assignment_changed') {
    lines.push(`Schedule: ${formatWindow(after.scheduledStart as string | null, after.scheduledEnd as string | null)}`);
    if (before.technicianId !== after.technicianId) lines.push(after.technicianId ? 'Technician assigned' : 'Technician removed');
  }
  if (a.action === 'attachment.added') lines.push(String(after.filename ?? ''));
  if (a.action === 'notification.failed') lines.push(String(after.error ?? ''));
  if (note) lines.push(`“${note}”`);
  if (!lines.length) return null;
  return <p className="mt-1 rounded-md bg-canvas px-2.5 py-1.5 text-[13px] text-ink-soft">{lines.filter(Boolean).join('. ')}</p>;
}
