export function Pagination({ page, limit, total, onPageChange }: { page: number; limit: number; total: number; onPageChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return <nav className="pagination" aria-label="Pagination">
    <p>Showing {total ? (page - 1) * limit + 1 : 0}–{Math.min(page * limit, total)} of {total}</p>
    <div><button className="button button--ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="button button--ghost" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Next</button></div>
  </nav>;
}
