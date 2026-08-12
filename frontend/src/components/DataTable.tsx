import type { ReactNode } from 'react';

export interface Column<T> { key: string; header: string; render: (row: T) => ReactNode; sortable?: boolean }

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort?: string;
  direction?: 'asc' | 'desc';
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  emptyTitle?: string;
  emptyMessage?: string;
}

export function DataTable<T>({ columns, rows, rowKey, sort, direction, onSort, emptyTitle = 'Nothing here yet', emptyMessage = 'New records will appear here.' }: DataTableProps<T>) {
  if (!rows.length) return <EmptyState title={emptyTitle} message={emptyMessage} />;
  return <div className="table-wrap"><table>
    <thead><tr>{columns.map((column) => <th key={column.key} scope="col">
      {column.sortable && onSort ? <button className="sort-button" onClick={() => onSort(column.key, sort === column.key && direction === 'asc' ? 'desc' : 'asc')}>
        {column.header}<span aria-hidden="true">{sort === column.key ? (direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span>
      </button> : column.header}
    </th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>)}</tbody>
  </table></div>;
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-state__icon" aria-hidden="true">◇</div><h3>{title}</h3><p>{message}</p>{action}</div>;
}
