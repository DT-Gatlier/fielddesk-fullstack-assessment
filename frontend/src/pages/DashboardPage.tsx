import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useSSEStore } from '../store/useSSEStore';

import { useAuth } from '../contexts/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const lastUpdate = useSSEStore(state => state.lastUpdate);
  const [summary, setSummary] = useState({
    open: 0,
    assigned: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
    total: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchSummary = async () => {
    try {
      const res = await api.get('/work-orders/dashboard-summary');
      setSummary(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [lastUpdate]);

  if (loading) return <div>Loading dashboard...</div>;

  return (
    <div className="container">
      <div className="flex items-center justify-between mb-4">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Dashboard</h1>
      </div>

      <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', display: 'grid', gap: '1rem' }}>
        <div className="card clickable-card" onClick={() => navigate('/work-orders?status=OPEN')} style={{ cursor: 'pointer' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{user?.role === 'TECHNICIAN' ? 'My Open' : 'Open'} Work Orders</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}>{summary.open}</div>
        </div>
        <div className="card clickable-card" onClick={() => navigate('/work-orders?status=ASSIGNED')} style={{ cursor: 'pointer' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{user?.role === 'TECHNICIAN' ? 'My Assigned' : 'Assigned'}</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem', color: '#92400E' }}>{summary.assigned}</div>
        </div>
        <div className="card clickable-card" onClick={() => navigate('/work-orders?status=IN_PROGRESS')} style={{ cursor: 'pointer' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{user?.role === 'TECHNICIAN' ? 'My In Progress' : 'In Progress'}</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem', color: 'var(--primary)' }}>{summary.inProgress}</div>
        </div>
        <div className="card clickable-card" onClick={() => navigate('/work-orders?status=COMPLETED')} style={{ cursor: 'pointer' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{user?.role === 'TECHNICIAN' ? 'My Completed' : 'Completed'}</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem', color: '#166534' }}>{summary.completed}</div>
        </div>
        <div className="card clickable-card" onClick={() => navigate('/work-orders?status=CANCELLED')} style={{ cursor: 'pointer' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{user?.role === 'TECHNICIAN' ? 'My Cancelled' : 'Cancelled'}</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem', color: '#991B1B' }}>{summary.cancelled}</div>
        </div>
        <div className="card clickable-card" onClick={() => navigate('/work-orders')} style={{ cursor: 'pointer' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{user?.role === 'TECHNICIAN' ? 'My Total' : 'Total'} Work Orders</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}>{summary.total}</div>
        </div>
      </div>
    </div>
  );
}
