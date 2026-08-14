import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import Loader from '../components/ui/Loader';

export default function WorkOrderFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [formData, setFormData] = useState({
    referenceNumber: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
    siteName: '',
  });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role === 'TECHNICIAN') {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (isEdit) {
      const fetchWorkOrder = async () => {
        try {
          const res = await api.get(`/work-orders/${id}`);
          const wo = res.data;
          setFormData({
            referenceNumber: wo.referenceNumber,
            title: wo.title,
            description: wo.description,
            priority: wo.priority,
            siteName: wo.siteName,
          });
        } catch (err: any) {
          setError('Failed to load work order');
        } finally {
          setLoading(false);
        }
      };
      fetchWorkOrder();
    }
  }, [id, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (isEdit) {
        await api.patch(`/work-orders/${id}`, {
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          siteName: formData.siteName,
        });
        navigate(`/work-orders/${id}`);
      } else {
        const res = await api.post('/work-orders', formData);
        navigate(`/work-orders/${res.data.id}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="container" style={{ maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>
        {isEdit ? 'Edit Work Order' : 'Create Work Order'}
      </h1>

      {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}

      <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        {!isEdit && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Reference Number</label>
            <input 
              type="text" 
              required
              className="form-control" 
              value={formData.referenceNumber}
              onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
            />
          </div>
        )}

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Title</label>
          <input 
            type="text" 
            required
            className="form-control" 
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Description</label>
          <textarea 
            required
            className="form-control" 
            rows={4}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Site Name</label>
          <input 
            type="text" 
            required
            className="form-control" 
            value={formData.siteName}
            onChange={(e) => setFormData({ ...formData, siteName: e.target.value })}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Priority</label>
          <select 
            className="form-control"
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
