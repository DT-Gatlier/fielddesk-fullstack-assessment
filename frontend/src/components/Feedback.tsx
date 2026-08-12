import type { ReactNode } from 'react';
import { ApiError } from '../api/client';

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return <div className="loading-state" role="status"><span className="spinner" /><span>{label}…</span></div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiError = error instanceof ApiError ? error : null;
  const title = apiError?.status === 403 ? 'Permission required' : apiError?.status === 404 ? 'Not available' : 'Something went wrong';
  return <div className="error-state" role="alert"><h3>{title}</h3><p>{error instanceof Error ? error.message : 'Please try again.'}</p>{apiError?.requestId && <small>Request ID: {apiError.requestId}</small>}{onRetry && <button className="button button--secondary" onClick={onRetry}>Try again</button>}</div>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Toast({ message, tone = 'success', onDismiss }: { message: string; tone?: 'success' | 'danger'; onDismiss: () => void }) {
  return <div className={`toast toast--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>{message}<button aria-label="Dismiss" onClick={onDismiss}>×</button></div>;
}
