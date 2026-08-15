import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import Loader from '../components/ui/Loader';
import { useToastStore } from '../store/useToastStore';

export default function UserManagementPage() {
  const { user } = useAuth();
  const { addToast } = useToastStore();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('TECHNICIAN');
  const [isCreating, setIsCreating] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (userId === user?.id) {
      addToast("You cannot change your own role.", 'warning');
      return;
    }
    
    setUpdating(userId);
    try {
      await api.patch(`/users/${userId}/role`, { role: newRole });
      addToast('Role updated successfully', 'success');
      fetchUsers();
    } catch (err: any) {
      addToast(err.response?.data?.error?.message || 'Failed to update role', 'error');
    } finally {
      setUpdating(null);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      await api.post('/users', { email: newEmail, password: newPassword, role: newRole });
      addToast('User created successfully', 'success');
      setNewEmail('');
      setNewPassword('');
      setNewRole('TECHNICIAN');
      fetchUsers();
    } catch (err: any) {
      addToast(err.response?.data?.error?.message || 'Failed to create user', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleStatus = async (userId: string) => {
    if (userId === user?.id) return;
    
    setUpdating(userId);
    try {
      await api.patch(`/users/${userId}/status`);
      addToast('User status updated', 'success');
      fetchUsers();
    } catch (err: any) {
      addToast(err.response?.data?.error?.message || 'Failed to update status', 'error');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="container">
      <div className="flex items-center justify-between mb-4">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>User Management</h1>
      </div>

      {user?.role === 'OWNER' && (
        <div className="card mb-6" style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Add New User</h2>
          <form onSubmit={handleCreateUser} className="flex items-end" style={{ gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Email</label>
              <input type="email" required className="input" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Password</label>
              <input type="password" required className="input" minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Role</label>
              <select className="form-control" value={newRole} onChange={e => setNewRole(e.target.value)}>
                <option value="OWNER">Owner</option>
                <option value="DISPATCHER">Dispatcher</option>
                <option value="TECHNICIAN">Technician</option>
              </select>
            </div>
            <div>
              <button type="submit" disabled={isCreating} className="btn btn-primary" style={{ whiteSpace: 'nowrap', height: '38px', padding: '0 1.5rem' }}>
                {isCreating ? 'Adding...' : 'Add User'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              {user?.role === 'OWNER' && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id}>
                <td>{u.email} {u.id === user?.id ? '(You)' : ''}</td>
                <td>
                  <select 
                    value={u.role} 
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    disabled={updating === u.id || user?.role !== 'OWNER' || u.id === user?.id}
                    className="form-control"
                  >
                    <option value="OWNER">Owner</option>
                    <option value="DISPATCHER">Dispatcher</option>
                    <option value="TECHNICIAN">Technician</option>
                  </select>
                </td>
                <td>
                  <span className={`badge ${u.isActive ? 'badge-completed' : 'badge-cancelled'}`}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                {user?.role === 'OWNER' && (
                  <td>
                    {u.id !== user?.id && (
                      <button 
                        onClick={() => handleToggleStatus(u.id)}
                        disabled={updating === u.id}
                        className={`btn ${u.isActive ? 'btn-danger' : 'btn-primary'}`}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                      >
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
