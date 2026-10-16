import type { Priority, Status } from '../api/types';

export const statusLabel: Record<Status, string> = {
  open: 'Open',
  in_progress: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const priorityLabel: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const timeOnly = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

/** "12 Oct 2026, 09:00 – 11:00" when on one day, full range otherwise. */
export function formatWindow(start: string | null, end: string | null): string {
  if (!start || !end) return 'Not scheduled';
  const s = new Date(start);
  const e = new Date(end);
  return s.toDateString() === e.toDateString()
    ? `${dateTime.format(s)} – ${timeOnly.format(e)}`
    : `${dateTime.format(s)} – ${dateTime.format(e)}`;
}

/** <input type="datetime-local"> works in local time without an offset. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Converts a datetime-local value (local time) to an ISO string with offset for the API. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const ACTIVITY: Record<string, string> = {
  'work_order.created': 'created the work order',
  'work_order.updated': 'edited details',
  'work_order.assignment_changed': 'changed the assignment',
  'work_order.status_changed': 'changed the status',
  'progress_event.accepted': 'submitted a progress update',
  'attachment.added': 'attached a file',
  'notification.delivered': 'notified the technician',
  'notification.failed': 'could not notify the technician',
};
export const activityLabel = (action: string) => ACTIVITY[action] ?? action;
