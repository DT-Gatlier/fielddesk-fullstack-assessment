import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, toQuery } from '../api/client';
import type { Page, Summary, WorkOrder } from '../api/types';
import { useAuth } from '../auth';
import { Icon, type IconName } from '../components/icons';
import { LiveIndicator } from '../components/Layout';
import { EmptyState, ErrorBanner, LoadingBlock, PageHeader, Panel, PRIORITY_EDGE, PriorityTag, StatusBadge, buttonClass, cx } from '../components/ui';
import { formatDateTime, formatWindow, statusLabel } from '../lib/format';
import { useRealtime } from '../realtime';

const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const dayNum = new Intl.DateTimeFormat(undefined, { day: 'numeric' });
const monthShort = new Intl.DateTimeFormat(undefined, { month: 'short' });

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function DashboardPage() {
  const { me } = useAuth();
  const { recent, fallbackInterval } = useRealtime();
  const summary = useQuery({
    queryKey: ['summary'],
    queryFn: () => api<{ data: Summary }>('/work-orders/summary').then((r) => r.data),
    refetchInterval: fallbackInterval,
  });
  const upcoming = useQuery({
    queryKey: ['work-orders', 'upcoming'],
    queryFn: () =>
      api<Page<WorkOrder>>(`/work-orders${toQuery({ status: 'open,in_progress,on_hold', sort: 'scheduledStart', order: 'asc', pageSize: 8 })}`),
    refetchInterval: fallbackInterval,
  });
  const isTech = me?.user.role === 'technician';
  const firstName = me?.user.name.split(' ')[0];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={<>{today.format(new Date())} · {greeting()}{firstName ? `, ${firstName}` : ''}</>}
        title={isTech ? 'My work' : 'Dashboard'}
        description={isTech ? 'Jobs assigned to you.' : `Everything happening at ${me?.organisation.name}.`}
        actions={!isTech && (
          <Link to="/work-orders/new" className={buttonClass('primary')}>
            <Icon name="plus" />
            New work order
          </Link>
        )}
      />

      {summary.isLoading ? (
        <LoadingBlock label="Loading counts…" />
      ) : summary.error ? (
        <ErrorBanner error={summary.error} onRetry={() => void summary.refetch()} />
      ) : summary.data ? (
        <SummaryStrip s={summary.data} isTech={isTech} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="Coming up"
          description="Next scheduled and unscheduled jobs"
          icon="calendar"
          className="lg:col-span-2"
          flush
          actions={
            <Link to="/work-orders" className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium whitespace-nowrap text-action hover:text-action-strong">
              All work orders <Icon name="chevronRight" className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {upcoming.isLoading ? (
            <LoadingBlock />
          ) : upcoming.error ? (
            <div className="p-5"><ErrorBanner error={upcoming.error} onRetry={() => void upcoming.refetch()} /></div>
          ) : upcoming.data?.data.length ? (
            <ul className="divide-y divide-line-soft">
              {upcoming.data.data.map((w) => (
                <li key={w.id}>
                  <Link
                    to={`/work-orders/${w.id}`}
                    className={cx('group flex items-center gap-4 border-l-[3px] px-5 py-3.5 transition-colors hover:bg-canvas/70', PRIORITY_EDGE[w.priority])}
                  >
                    <DateTile iso={w.scheduledStart} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate font-medium text-ink group-hover:text-action-strong">{w.title}</span>
                        <span className="hidden font-mono text-[11px] text-ink-faint sm:inline">{w.reference}</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-soft">
                        <span className="inline-flex items-center gap-1"><Icon name="pin" className="h-3 w-3 text-ink-faint" />{w.siteName}</span>
                        <span className="inline-flex items-center gap-1"><Icon name="user" className="h-3 w-3 text-ink-faint" />{w.technician?.name ?? 'unassigned'}</span>
                        <span className="tabular hidden md:inline">{formatWindow(w.scheduledStart, w.scheduledEnd)}</span>
                      </span>
                    </span>
                    <span className="hidden sm:block"><PriorityTag priority={w.priority} /></span>
                    <StatusBadge status={w.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState title="Nothing scheduled" icon="calendar">
                {isTech ? 'New assignments will appear here automatically.' : 'Create a work order and assign a technician to fill the schedule.'}
              </EmptyState>
            </div>
          )}
        </Panel>

        <Panel title="Live activity" icon="pulse" actions={<LiveIndicator />}>
          {recent.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-signal-tint text-signal">
                <Icon name="pulse" />
              </span>
              <p className="mt-3 max-w-[16rem] text-sm text-ink-soft">Changes made by your team appear here as they happen.</p>
            </div>
          ) : (
            <ol className="space-y-4 text-sm">
              {recent.map((e, i) => (
                <li key={`${e.at}-${i}`} className="rise-in flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-action-tint text-action">
                    <Icon name={eventIcon(e.type)} className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <Link to={`/work-orders/${e.workOrderId}`} className="hover:text-action-strong">
                      <span className="tabular font-medium">{e.reference ?? 'Work order'}</span>{' '}
                      <span className="text-ink-soft">{describe(e.type, e.status)}</span>
                    </Link>
                    <div className="text-xs text-ink-faint">{formatDateTime(e.at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}

function DateTile({ iso }: { iso: string | null }) {
  if (!iso) {
    return (
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-dashed border-line text-ink-faint" title="Not scheduled">
        <Icon name="clock" />
      </span>
    );
  }
  const d = new Date(iso);
  return (
    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-line bg-panel leading-none shadow-xs">
      <span className="text-[10px] font-medium tracking-wide text-action uppercase">{monthShort.format(d)}</span>
      <span className="tabular mt-0.5 text-base font-semibold text-ink">{dayNum.format(d)}</span>
    </span>
  );
}

function eventIcon(type: string): IconName {
  switch (type) {
    case 'work_order.created': return 'plus';
    case 'work_order.assignment_changed': return 'calendar';
    case 'work_order.status_changed': return 'check';
    case 'attachment.added': return 'paperclip';
    default: return 'pencil';
  }
}

function describe(type: string, status?: string) {
  switch (type) {
    case 'work_order.created': return 'was created';
    case 'work_order.assignment_changed': return 'was assigned or rescheduled';
    case 'work_order.status_changed': return `is now ${statusLabel[status as keyof typeof statusLabel]?.toLowerCase() ?? status}`;
    case 'attachment.added': return 'has a new attachment';
    default: return 'was updated';
  }
}

function SummaryStrip({ s, isTech }: { s: Summary; isTech: boolean }) {
  const items: { label: string; value: number; to: string; dot: string; alert?: boolean }[] = [
    { label: 'Open', value: s.byStatus.open, to: '/work-orders?status=open', dot: 'bg-action' },
    { label: 'In progress', value: s.byStatus.in_progress, to: '/work-orders?status=in_progress', dot: 'bg-signal' },
    { label: 'On hold', value: s.byStatus.on_hold, to: '/work-orders?status=on_hold', dot: 'bg-ink-faint' },
    { label: 'Scheduled today', value: s.scheduledToday, to: '/work-orders', dot: 'bg-prio-medium' },
    ...(isTech ? [] : [{ label: 'Unassigned', value: s.unassigned, to: '/work-orders?technicianId=unassigned&status=open,on_hold', dot: 'bg-violet-400' }]),
    { label: 'Overdue', value: s.overdue, to: '/work-orders?status=open,in_progress,on_hold&sort=scheduledStart&order=asc', dot: 'bg-danger', alert: s.overdue > 0 },
    { label: 'Completed', value: s.byStatus.completed, to: '/work-orders?status=completed', dot: 'bg-ok' },
  ];
  return (
    <dl className={cx('grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4', isTech ? 'xl:grid-cols-6' : 'xl:grid-cols-7')} aria-label="Work order counts">
      {items.map((i) => (
        <Link
          key={i.label}
          to={i.to}
          className={cx(
            'group relative rounded-xl border bg-panel px-4 py-3.5 shadow-card transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-lift',
            i.alert ? 'border-danger/30 bg-gradient-to-b from-danger-tint to-panel' : 'border-line hover:border-action/30',
          )}
        >
          <span className={cx('absolute top-4 right-4 h-1.5 w-1.5 rounded-full', i.dot)} aria-hidden />
          <dt className="pr-4 text-xs font-medium text-ink-soft">{i.label}</dt>
          <dd className={cx('tabular mt-2 text-[28px] leading-none font-semibold tracking-tight', i.alert ? 'text-danger' : 'text-ink')}>{i.value}</dd>
        </Link>
      ))}
    </dl>
  );
}
