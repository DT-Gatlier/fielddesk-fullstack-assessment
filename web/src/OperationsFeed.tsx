import { useEffect, useState } from 'react';

type Entry = {
  id: string;
  action?: string;
  timestamp?: string;
  changedBy?: { name: string } | null;
  beforeData?: unknown;
  afterData?: unknown;
  status?: string;
  attempts?: number;
  recipient?: string;
  lastError?: string | null;
  createdAt?: string;
  actor?: string;
  message?: string | null;
  job?: { referenceNumber: string; title: string } | null;
};

type OperationsFeedProps = {
  kind: 'activity' | 'notifications';
  jobId?: string;
};

export function OperationsFeed({ kind, jobId }: OperationsFeedProps) {
  const [items, setItems] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const endpoint = jobId ? `jobs/${jobId}/history` : kind;
    setLoading(true);
    setError('');

    fetch(`/api/${endpoint}?page=${page}&pageSize=15`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error?.message || 'Could not load records.');
        }
        return result;
      })
      .then(result => {
        setItems(kind === 'activity' ? result.entries : result.notifications);
        setPages(result.pagination.pages);
      })
      .catch(issue => {
        if (!controller.signal.aborted) setError(issue.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, jobId, page, revision]);
  useEffect(() => {
    const timer = setInterval(() => setRevision(value => value + 1), 15000);
    return () => clearInterval(timer);
  }, []);
  const isActivity = kind === 'activity';
  const title = jobId
    ? 'Work-order history'
    : isActivity ? 'Organisation activity' : 'Assignment notifications';

  return (
    <section className="panel operations-feed">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>
            {isActivity
              ? 'A read-only history of user and system actions.'
              : 'Delivery attempts and outcomes from the notification worker.'}
          </p>
        </div>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => setRevision(value => value + 1)}
        >
          Refresh
        </button>
      </div>

      {error && <div className="alert error" role="alert">{error}</div>}

      {loading ? (
        <p className="loading-state" role="status">Loading records…</p>
      ) : items.length > 0 ? (
        <div className="feed-list">
          {items.map(item => (
            <article className="feed-item" key={item.id}>
              <div className="feed-item-heading">
                <strong>
                  {item.action?.replaceAll('_', ' ') || item.job?.referenceNumber || 'Notification'}
                </strong>
                <time>{new Date(item.timestamp || item.createdAt || '').toLocaleString()}</time>
              </div>
              {item.job && <p>{item.job.referenceNumber} · {item.job.title}</p>}
              {item.message && <p>{item.message}</p>}

              {isActivity ? (
                <>
                  <p>By {item.actor || item.changedBy?.name || 'System'}</p>
                  {(item.beforeData || item.afterData) && (
                    <details>
                      <summary>View changes</summary>
                      <div className="audit-comparison">
                        <div>
                          <b>Before</b>
                          <pre>{JSON.stringify(item.beforeData, null, 2) || '—'}</pre>
                        </div>
                        <div>
                          <b>After</b>
                          <pre>{JSON.stringify(item.afterData, null, 2) || '—'}</pre>
                        </div>
                      </div>
                    </details>
                  )}
                </>
              ) : (
                <>
                  <p>
                    <span className={`delivery-status ${item.status?.toLowerCase()}`}>
                      {item.status}
                    </span>
                    {' · '}{item.attempts} attempt{item.attempts === 1 ? '' : 's'}
                    {' · '}{item.recipient}
                  </p>
                  {item.lastError && <p className="delivery-error">{item.lastError}</p>}
                  {item.status === 'PENDING' && <small>Waiting for delivery or retry.</small>}
                </>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <b>No {kind} yet</b>
          <p>
            {isActivity
              ? 'Create or update a work order to record activity.'
              : 'Assign a technician to a work order to queue a notification.'}
          </p>
        </div>
      )}

      <div className="pagination">
        <span>Page {page} of {pages || 1}</span>
        <div>
          <button disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>
            Previous
          </button>
          <button disabled={loading || page >= pages} onClick={() => setPage(value => value + 1)}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
