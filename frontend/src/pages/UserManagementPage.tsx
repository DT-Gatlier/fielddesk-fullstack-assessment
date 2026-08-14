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

  if (loading) return <Loader />;

  return (
    <div className="container">
      <div className="flex items-center justify-between mb-4">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>User Management</h1>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
