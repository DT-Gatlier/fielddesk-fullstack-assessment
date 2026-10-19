import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ApiError, label, type Priority, type Status } from './api';
import { useAuth } from './auth';
import { useRealtimeStatus } from './realtime';

export function Layout() {
  const { user, logout, can } = useAuth();
  const status = useRealtimeStatus();
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          FieldDesk <span className="org">{user?.organisation.name}</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/work-orders">Work orders</NavLink>
          {can('owner') && <NavLink to="/users">Users</NavLink>}
          {can('owner', 'dispatcher') && <NavLink to="/settings">Settings</NavLink>}
        </nav>
        <div className="session">
          <span className={`live live-${status}`} title={status === 'live' ? 'Live updates on' : 'Live updates unavailable; refreshing every 30 seconds'}>
            {status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Offline'}
          </span>
          <span className="whoami">
            {user?.name} · {label(user?.role ?? '')}
          </span>
          <button className="link" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export const StatusBadge = ({ status }: { status: Status }) => <span className={`badge status-${status}`}>{label(status)}</span>;
export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <span className={`badge priority-${priority}`}>{label(priority)}</span>
);

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  const apiError = error instanceof ApiError ? error : null;
  return (
    <div className="alert alert-error" role="alert">
      <strong>{apiError?.status === 409 ? 'Conflict: ' : ''}</strong>
      {apiError?.message ?? 'Something went wrong.'}
      {apiError && apiError.details.length > 0 && (
        <ul>
          {apiError.details.filter((d) => !d.path || apiError.status === 409).map((d, i) => (
            <li key={i}>{d.message}</li>
          ))}
        </ul>
      )}
      {apiError?.requestId && <div className="muted small">Reference: {apiError.requestId}</div>}
      {onRetry && (
        <button className="secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export const Loading = ({ what = 'Loading' }: { what?: string }) => (
  <div className="loading" role="status">
    {what}…
  </div>
);

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

/** Labels a single input and links its error message via aria-describedby. */
export function Field({ label: text, error, children }: { label: string; error?: string; children: ReactElement }) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{text}</label>
      {cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      {error && (
        <span id={errorId} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
