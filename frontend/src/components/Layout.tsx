import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { useRealtime, type LiveState } from '../realtime';
import { Icon, LogoMark, type IconName } from './icons';
import { Avatar, cx } from './ui';

const LIVE_TEXT: Record<LiveState, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  degraded: 'Live updates paused',
  unavailable: 'Live updates off',
};

export function LiveIndicator() {
  const { state } = useRealtime();
  const live = state === 'live';
  const pending = state === 'connecting' || state === 'reconnecting';
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        live ? 'border-signal/35 bg-signal-tint text-[#8a5300]' : 'border-line bg-panel text-ink-soft',
      )}
      title={live ? 'Changes appear automatically' : 'Data refreshes every 30 seconds until live updates resume'}
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        {live && <span className="live-ping absolute inset-0 rounded-full bg-signal" />}
        <span className={cx('relative h-2 w-2 rounded-full', live ? 'bg-signal' : pending ? 'animate-pulse bg-ink-faint' : 'bg-ink-faint/60')} />
      </span>
      {LIVE_TEXT[state]}
    </span>
  );
}

export function Layout() {
  const { me, can, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const nav: { to: string; label: string; icon: IconName; show: boolean }[] = [
    { to: '/', label: 'Dashboard', icon: 'dashboard', show: true },
    { to: '/work-orders', label: 'Work orders', icon: 'clipboard', show: true },
    { to: '/team', label: 'Team', icon: 'users', show: can('users:manage') },
  ];

  return (
    <div className="min-h-screen lg:pl-64">
      {/* One sidebar for every breakpoint: fixed on desktop, a slide-in drawer on small screens. */}
      <aside
        id="app-sidebar"
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-night text-night-text transition-[transform,visibility] duration-200 ease-out lg:visible lg:translate-x-0',
          open ? 'translate-x-0 shadow-pop' : 'invisible -translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-3 px-5">
          <LogoMark />
          <div className="min-w-0 leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-white">FieldDesk</div>
            <div className="truncate text-xs text-night-text/80">{me?.organisation.name}</div>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="ml-auto rounded-md p-1.5 text-night-text hover:bg-night-raised hover:text-white lg:hidden" aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 pt-4" aria-label="Main">
          <p className="px-3 pb-2 text-[11px] font-medium tracking-wider text-night-text/60 uppercase" aria-hidden>Workspace</p>
          {nav.filter((n) => n.show).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cx(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-night-raised text-white' : 'hover:bg-night-raised/60 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-y-2 -left-3 w-[3px] rounded-r-full bg-indigo-400" aria-hidden />}
                  <Icon name={n.icon} className={cx('h-[18px] w-[18px]', isActive ? 'text-indigo-300' : 'text-night-text/70 group-hover:text-white')} />
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-night-line p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar name={me?.user.name} className="ring-2 ring-night-line" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium text-white">{me?.user.name}</div>
              <div className="text-xs text-night-text/80 capitalize">{me?.user.role}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-night-text hover:bg-night-raised hover:text-white"
          >
            <Icon name="logout" className="h-[18px] w-[18px]" />
            Sign out
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-night/50 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <header className="sticky top-0 z-20 border-b border-line/80 bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="-ml-1.5 rounded-md p-1.5 text-ink-soft hover:bg-line-soft hover:text-ink lg:hidden"
            aria-label="Open menu"
            aria-controls="app-sidebar"
            aria-expanded={open}
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 lg:hidden">
            <LogoMark className="h-7 w-7" />
            <span className="font-semibold tracking-tight">FieldDesk</span>
          </div>
          <div className="hidden min-w-0 items-center gap-2 text-sm text-ink-soft lg:flex">
            <Icon name="building" className="h-4 w-4 text-ink-faint" />
            <span className="truncate">{me?.organisation.name}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <LiveIndicator />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
        <Outlet />
      </main>
    </div>
  );
}
