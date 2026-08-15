import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useSSEStore } from '../store/useSSEStore';
import Loader from '../components/ui/Loader';
import { useToastStore } from '../store/useToastStore';

export default function WorkOrderListPage() {
  const { user } = useAuth();
  const { addToast } = useToastStore();
  const lastUpdate = useSSEStore(state => state.lastUpdate);
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get('status') || '');

  useEffect(() => {
    const stat = searchParams.get('status');
    setStatus(stat || '');
  }, [searchParams]);
  const [priority, setPriority] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');

  const fetchWorkOrders = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        sortBy,
        sortDir,
      });
      if (search) params.append('search', search);
      if (status) params.append('status', status);
      if (priority) params.append('priority', priority);

      const res = await api.get(`/work-orders?${params.toString()}`);
      setWorkOrders(res.data.data);
      setTotalPages(res.data.meta.totalPages);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkOrders();
  }, [lastUpdate, page, search, status, priority, sortBy, sortDir]);

  const handleExport = async () => {
    try {
      const res = await api.get('/reports/work-orders/csv', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'work_orders.csv');
      document.body.appendChild(link);
      link.click();
    } catch (error) {
      addToast('Export failed', 'error');
    }
  };

  return (
    <div className="container">
      <div className="flex items-center justify-between mb-4">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Work Orders</h1>
        <div className="flex gap-2">
          {(user?.role === 'OWNER' || user?.role === 'DISPATCHER') && (
            <>
              <Link to="/work-orders/new" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                + Create
              </Link>
              <button onClick={handleExport} className="btn btn-outline">
                Export CSV
              </button>
            </>
          )}
        </div>
      </div>

      <div className="filter-bar">
        <input 
          type="text" 
          placeholder="Search reference, title, site..." 
          value={search} 
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
          className="form-control" 
        />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="form-control">
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className="form-control">
          <option value="">All Priorities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </select>
      </div>

      {loading && workOrders.length === 0 && <Loader text="Loading work orders..." />}
      <div className="table-container" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        <table>
          <thead>
            <tr>
              <th onClick={() => { setSortBy('referenceNumber'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }} style={{ cursor: 'pointer' }}>
                Reference {sortBy === 'referenceNumber' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => { setSortBy('title'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }} style={{ cursor: 'pointer' }}>
                Title {sortBy === 'title' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => { setSortBy('status'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }} style={{ cursor: 'pointer' }}>
                Status {sortBy === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th onClick={() => { setSortBy('priority'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }} style={{ cursor: 'pointer' }}>
                Priority {sortBy === 'priority' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th>Site</th>
              <th>Technician</th>
              <th onClick={() => { setSortBy('createdAt'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }} style={{ cursor: 'pointer' }}>
                Created {sortBy === 'createdAt' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {workOrders.map((wo: any) => (
              <tr key={wo.id}>
                <td>{wo.referenceNumber}</td>
                <td>{wo.title}</td>
                <td>
                  <span className={`badge badge-${wo.status.toLowerCase()}`}>
                    {wo.status}
                  </span>
                </td>
                <td>
                  <span className={`badge badge-priority-${wo.priority.toLowerCase()}`}>
                    {wo.priority}
                  </span>
                </td>
                <td>{wo.siteName}</td>
                <td>{wo.assignedTechnician?.email || '-'}</td>
                <td>{new Date(wo.createdAt).toLocaleDateString()}</td>
                <td>
                  <Link to={`/work-orders/${wo.id}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {workOrders.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                  No work orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))} 
            disabled={page === 1}
            className="btn btn-outline"
          >
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
            disabled={page === totalPages}
            className="btn btn-outline"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
