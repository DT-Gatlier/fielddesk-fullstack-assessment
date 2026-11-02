import { PAGE_SIZE, label } from "../constants.js";

export const Loading = ({ text = "Loading…" }) => (
  <div className="state" role="status"><span className="spinner" />{text}</div>
);

export const EmptyState = ({ title, children }) => (
  <div className="state empty"><h3>{title}</h3>{children}</div>
);

export function ErrorBox({ error, onRetry }) {
  const head =
    error?.status === 403 ? "You don't have access to this."
    : error?.status === 404 ? "We couldn't find that."
    : "Something went wrong.";
  return (
    <div className="state error" role="alert">
      <strong>{head}</strong>
      <p>{error?.message}</p>
      {error?.requestId && <small>Request ID: {error.requestId}</small>}
      {onRetry && <button onClick={() => onRetry()}>Try again</button>}
    </div>
  );
}

export const FieldError = ({ msg }) => (msg ? <small className="field-error">{msg}</small> : null);

export const StatusBadge = ({ status }) => <span className={`badge s-${status}`}>{label(status)}</span>;
export const PriorityBadge = ({ priority }) => <span className={`badge p-${priority}`}>{priority}</span>;

export function Pagination({ page, count, onPage }) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  return (
    <nav className="pagination" aria-label="Pagination">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span>Page {page} of {pages} ({count} total)</span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  );
}
