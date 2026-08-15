import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { Trash2, Download } from 'lucide-react';
import Loader from '../components/ui/Loader';
import { useToastStore } from '../store/useToastStore';
import { useSSEStore } from '../store/useSSEStore';

export default function WorkOrderDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const lastUpdate = useSSEStore(state => state.lastUpdate);
  const [wo, setWo] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToastStore();
  
  // Assignment state
  const [assignForm, setAssignForm] = useState({
    technicianId: '',
    scheduledStart: '',
    scheduledEnd: '',
  });
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleStatusChange = async (newStatus: string) => {
    try {
      await api.patch(`/work-orders/${id}`, { status: newStatus });
      fetchDetails();
    } catch (e) {
      addToast('Failed to update status', 'error');
    }
  };

  const fetchDetails = async () => {
    try {
      const res = await api.get(`/work-orders/${id}`);
      setWo(res.data);
      
      if (user?.role === 'OWNER' || user?.role === 'DISPATCHER') {
        const histRes = await api.get(`/work-orders/${id}/history`);
        setHistory(histRes.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTechnicians = async () => {
    try {
      const res = await api.get('/users');
      // Dispatchers and Technicians can both be assigned
      const assignableUsers = res.data.data.filter((u: any) => u.role === 'TECHNICIAN' || u.role === 'DISPATCHER');
      setTechnicians(assignableUsers);
    } catch (e) {
      console.error('Failed to fetch technicians', e);
    }
  };

  useEffect(() => {
    fetchDetails();
    if (user?.role === 'OWNER' || user?.role === 'DISPATCHER') {
      fetchTechnicians();
    }
  }, [id, user, lastUpdate]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssigning(true);
    setAssignError('');
    try {
      await api.post(`/work-orders/${id}/assign`, {
        assignedTechnicianId: assignForm.technicianId,
        scheduledStart: new Date(assignForm.scheduledStart).toISOString(),
        scheduledEnd: new Date(assignForm.scheduledEnd).toISOString(),
      });
      addToast('Assigned successfully', 'success');
      fetchDetails();
    } catch (err: any) {
      setAssignError(err.response?.data?.error?.message || 'Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    setUploadError('');
    try {
      await api.post(`/work-orders/${id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      addToast('File uploaded successfully', 'success');
      await fetchDetails();
    } catch (err: any) {
      setUploadError(err.response?.data?.error?.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = ''; // clear input
    }
  };

  const handleDownload = async (attId: string, filename: string) => {
    try {
      const response = await api.get(`/work-orders/${id}/attachments/${attId}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      addToast('Failed to download attachment', 'error');
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    if (!window.confirm('Are you sure you want to delete this attachment?')) return;
    try {
      await api.delete(`/work-orders/${id}/attachments/${attId}`);
      fetchDetails();
    } catch (err: any) {
      addToast(err.response?.data?.error?.message || 'Failed to delete attachment', 'error');
    }
  };

  if (loading) return <Loader text="Loading work order details..." />;
  if (!wo) return <div>Work order not found</div>;

  return (
    <div className="container">
      <div className="flex justify-between items-center mb-4">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
          {wo.referenceNumber}: {wo.title}
        </h1>
        <div className="flex gap-2 items-center">
          {(user?.role === 'OWNER' || user?.role === 'DISPATCHER') ? (
            <select 
              value={wo.status} 
              onChange={(e) => handleStatusChange(e.target.value)}
              className="form-control"
              style={{ width: 'auto', display: 'inline-block', padding: '0.25rem 0.5rem' }}
            >
              <option value="OPEN">OPEN</option>
              <option value="ASSIGNED">ASSIGNED</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          ) : (
            <span className={`badge badge-${wo.status.toLowerCase()}`}>
              {wo.status}
            </span>
          )}
          {(user?.role === 'OWNER' || user?.role === 'DISPATCHER') && (
            <Link to={`/work-orders/${id}/edit`} className="btn btn-outline" style={{ textDecoration: 'none' }}>
              Edit
            </Link>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Details</h3>
          <p><strong>Description:</strong> {wo.description}</p>
          <p className="mt-4"><strong>Site:</strong> {wo.siteName}</p>
          <p><strong>Priority:</strong> {wo.priority}</p>
          <p><strong>Assigned To:</strong> {wo.assignedTechnician?.email || 'Unassigned'}</p>
          {wo.scheduledStart && (
            <p><strong>Scheduled:</strong> {format(new Date(wo.scheduledStart), 'PPp')} to {format(new Date(wo.scheduledEnd), 'p')}</p>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Attachments</h3>
          {wo.attachments?.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No attachments.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {wo.attachments?.map((att: any) => (
                <li key={att.id} style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                  <span style={{ fontSize: '0.875rem' }}>{att.originalFilename}</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={() => handleDownload(att.id, att.originalFilename)}
                      className="btn btn-outline" 
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      title="Download"
                    >
                      <Download size={14} />
                    </button>
                    {(user?.role === 'OWNER' || String(user?.id) === String(att.uploadedBy)) && (
                      <button 
                        onClick={() => handleDeleteAttachment(att.id)}
                        className="btn btn-outline" 
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--error)', borderColor: 'var(--error)' }}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <h4>Add Attachment</h4>
            {uploadError && <p style={{ color: 'red', fontSize: '0.875rem' }}>{uploadError}</p>}
            <input type="file" onChange={handleFileUpload} disabled={uploading} style={{ marginTop: '0.5rem' }} />
            {uploading && <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem' }}>Uploading...</span>}
          </div>
        </div>
      </div>

      {(user?.role === 'OWNER' || user?.role === 'DISPATCHER') && (
        <div className="card mt-4">
          <h3 style={{ marginBottom: '1rem' }}>Assign Technician</h3>
          {assignError && <div style={{ color: 'red', marginBottom: '1rem' }}>{assignError}</div>}
          <form onSubmit={handleAssign} className="inline-form">
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Technician</label>
              <select 
                required
                className="form-control"
                value={assignForm.technicianId}
                onChange={(e) => setAssignForm({ ...assignForm, technicianId: e.target.value })}
              >
                <option value="">Select a technician</option>
                {technicians.map(t => (
                  <option key={t.id} value={t.id}>{t.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Start Time</label>
              <input 
                type="datetime-local" 
                required
                className="form-control"
                value={assignForm.scheduledStart}
                onChange={(e) => setAssignForm({ ...assignForm, scheduledStart: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>End Time</label>
              <input 
                type="datetime-local" 
                required
                className="form-control"
                value={assignForm.scheduledEnd}
                onChange={(e) => setAssignForm({ ...assignForm, scheduledEnd: e.target.value })}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={assigning}>
              {assigning ? 'Assigning...' : 'Assign'}
            </button>
          </form>
        </div>
      )}

      {(user?.role === 'OWNER' || user?.role === 'DISPATCHER') && (
        <div className="card mt-4">
          <h3 style={{ marginBottom: '1rem' }}>Audit History</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td>{format(new Date(h.createdAt), 'PP p')}</td>
                    <td>{h.actor?.email || 'System'}</td>
                    <td>{h.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
