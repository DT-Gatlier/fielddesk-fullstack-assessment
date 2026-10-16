import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { ApiError } from '../api/client';
import type { Priority, Status } from '../api/types';
import { priorityLabel, statusLabel } from '../lib/format';
import { Icon, type IconName } from './icons';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';
const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg border font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 select-none disabled:cursor-not-allowed disabled:opacity-50';
const BUTTON_SIZE: Record<ButtonSize, string> = { sm: 'h-8 px-3 text-[13px]', md: 'h-9 px-3.5 text-sm' };
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'border-action-strong bg-action text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_1px_2px_rgb(16_24_40/0.1)] hover:bg-action-strong',
  secondary: 'border-line bg-panel text-ink shadow-xs hover:border-ink-faint/50 hover:bg-canvas',
  danger: 'border-danger/30 bg-panel text-danger shadow-xs hover:border-danger/50 hover:bg-danger-tint',
  ghost: 'border-transparent bg-transparent text-ink-soft hover:bg-line-soft hover:text-ink',
};

/** Shared so links that act as buttons look identical to buttons. */
export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cx(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], className);
}

export function Button({
  variant = 'secondary',
  size = 'md',
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; busy?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || busy} aria-busy={busy || undefined} className={buttonClass(variant, size, className)}>
      {busy && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small, label = 'Loading' }: { small?: boolean; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cx('inline-block animate-spin rounded-full border-2 border-current border-r-transparent opacity-80', small ? 'h-3.5 w-3.5' : 'h-5 w-5')} />
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 px-1 py-12 text-sm text-ink-soft">
      <span className="text-action"><Spinner label={label} /></span>
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, icon = 'inbox', children }: { title: string; icon?: IconName; children?: ReactNode }) {
  return (
    <div className="rise-in flex flex-col items-center rounded-xl border border-dashed border-line bg-panel/60 px-6 py-12 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-line-soft text-ink-faint ring-8 ring-line-soft/40">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-4 font-semibold text-ink">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

/** Explains what went wrong in plain language; conflicts get their own tone. */
export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  const e = error instanceof ApiError ? error : null;
  const isConflict = e?.status === 409;
  const message = e?.message ?? 'Something went wrong. Try again.';
  return (
    <div
      role="alert"
      className={cx(
        'rise-in flex gap-3 rounded-lg border px-4 py-3 text-sm',
        isConflict ? 'border-signal/40 bg-signal-tint text-ink' : 'border-danger/25 bg-danger-tint text-danger',
      )}
    >
      <Icon name="alert" className={cx('mt-0.5 h-4 w-4 shrink-0', isConflict ? 'text-signal' : 'text-danger')} />
      <div className="min-w-0">
        <p className="font-medium">{isConflict ? 'Conflict' : 'Error'}: {message}</p>
        <ConflictDetail error={e} />
        {(e?.requestId || onRetry) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs opacity-80">
            {e?.requestId && <span className="font-mono">Reference {e.requestId}</span>}
            {onRetry && (
              <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
                Try again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ConflictDetail({ error }: { error: ApiError | null }) {
  const wo = (error?.details as { conflictingWorkOrder?: { reference: string; scheduledStart: string; scheduledEnd: string } } | undefined)
    ?.conflictingWorkOrder;
  if (!wo) return null;
  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <p className="mt-1 text-ink-soft">
      Already booked on {wo.reference}: {fmt.format(new Date(wo.scheduledStart))} – {fmt.format(new Date(wo.scheduledEnd))}.
    </p>
  );
}

/** Inline success confirmation after a save. */
export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rise-in flex items-center gap-2 text-sm font-medium text-ok">
      <Icon name="check" className="h-4 w-4" />
      {children}
    </p>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-ink-faint">{hint}</p>}
      {error && <p id={`${id}-err`} className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

const control =
  'w-full rounded-lg border border-line bg-panel px-3 text-sm text-ink shadow-xs placeholder:text-ink-faint transition-[border-color,box-shadow] duration-150 ' +
  'hover:border-ink-faint/50 focus:border-action focus:outline-none focus:ring-4 focus:ring-action/12 ' +
  'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-faint aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/12';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(control, 'h-10', p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(control, 'select-chevron h-10', p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(control, 'py-2.5', p.className)} />;

const STATUS_STYLE: Record<Status, { pill: string; dot: string }> = {
  open: { pill: 'bg-action-tint text-action-strong ring-action/15', dot: 'bg-action' },
  in_progress: { pill: 'bg-signal-tint text-[#8a5300] ring-signal/30', dot: 'bg-signal' },
  on_hold: { pill: 'bg-line-soft text-ink-soft ring-ink-faint/20', dot: 'bg-ink-faint' },
  completed: { pill: 'bg-ok-tint text-ok ring-ok/20', dot: 'bg-ok' },
  cancelled: { pill: 'bg-line-soft text-ink-faint ring-ink-faint/15 line-through', dot: 'bg-ink-faint/60' },
};
export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', s.pill)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden />
      {statusLabel[status]}
    </span>
  );
}

export const PRIORITY_EDGE: Record<Priority, string> = {
  low: 'border-l-prio-low',
  medium: 'border-l-prio-medium',
  high: 'border-l-prio-high',
  urgent: 'border-l-prio-urgent',
};
const PRIORITY_BARS: Record<Priority, number> = { low: 1, medium: 2, high: 3, urgent: 4 };
const PRIORITY_COLOR: Record<Priority, string> = {
  low: 'bg-prio-low', medium: 'bg-prio-medium', high: 'bg-prio-high', urgent: 'bg-prio-urgent',
};
/** Signal-strength bars: readable at a glance without relying on colour alone. */
export function PriorityTag({ priority }: { priority: Priority }) {
  const n = PRIORITY_BARS[priority];
  return (
    <span className={cx('inline-flex items-center gap-2 text-xs font-medium whitespace-nowrap', priority === 'urgent' ? 'text-prio-urgent' : 'text-ink-soft')}>
      <span className="flex h-3 items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cx('w-[3px] rounded-sm', i <= n ? PRIORITY_COLOR[priority] : 'bg-line')} style={{ height: `${25 + i * 18.75}%` }} />
        ))}
      </span>
      {priorityLabel[priority]}
    </span>
  );
}

export function Panel({
  title,
  description,
  icon,
  actions,
  children,
  className,
  flush,
}: {
  title?: string;
  description?: string;
  icon?: IconName;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Body without padding, for lists and tables that run edge to edge. */
  flush?: boolean;
}) {
  return (
    <section className={cx('rounded-xl border border-line bg-panel shadow-card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <Icon name={icon} className="h-4 w-4 shrink-0 text-ink-faint" />}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>}
              {description && <p className="text-xs text-ink-faint">{description}</p>}
            </div>
          </div>
          {actions}
        </header>
      )}
      <div className={flush ? undefined : 'p-5'}>{children}</div>
    </section>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[13px] text-ink-faint">{eyebrow}</div>}
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink break-words">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Initials avatar with a stable hue per name. */
export function Avatar({ name, size = 'md', className }: { name?: string | null; size?: 'sm' | 'md'; className?: string }) {
  const label = (name ?? '?').trim();
  const initials = label.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
  const hues = ['bg-indigo-100 text-indigo-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-700', 'bg-violet-100 text-violet-700'];
  const hue = hues[[...label].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length];
  return (
    <span aria-hidden className={cx('inline-grid shrink-0 place-items-center rounded-full font-semibold', size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs', hue, className)}>
      {initials}
    </span>
  );
}

export { cx };
