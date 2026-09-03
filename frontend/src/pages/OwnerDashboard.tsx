import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Briefcase, CheckCircle, HardDrive, Download, Users, Plus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Modal } from '../components/ui/modal';

const fetchSummaryCounts = async () => {
  const [openRes, completedRes] = await Promise.all([
    api.get('/work-orders?status=open&pageSize=1'),
    api.get('/work-orders?status=completed&pageSize=1')
  ]);
  return {
    open: openRes.data.total,
    completed: completedRes.data.total
  };
};

const fetchQuota = async () => {
  const res = await api.get('/organisation/quota');
  return res.data;
};

const fetchUsers = async () => {
  const res = await api.get('/users');
  return res.data;
};

const OwnerDashboard: React.FC = () => {
  const queryClient = useQueryClient();
  
  const { data: counts, isLoading: isCountsLoading, error: countsError } = useQuery({
    queryKey: ['summaryCounts'],
    queryFn: fetchSummaryCounts
  });

  const { data: quota, isLoading: isQuotaLoading } = useQuery({
    queryKey: ['quota'],
    queryFn: fetchQuota
  });

  const { data: users, isLoading: isUsersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers
  });

  const [isInviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('technician');

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string, role: string }) => {
      await api.post('/users', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setInviteModalOpen(false);
      setInviteEmail('');
      setInviteRole('technician');
    }
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string, role: string }) => {
      await api.patch(`/users/${id}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });

  const handleExport = async () => {
    try {
      const res = await api.get('/work-orders/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.setAttribute('download', `work_orders_${timestamp}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      console.error('Export failed', error);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const quotaPercent = quota ? Math.min(100, Math.round((quota.storage_used_bytes / quota.storage_quota_bytes) * 100)) : 0;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Owner Dashboard</h1>
        <Button onClick={handleExport} className="gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Total Open</CardTitle>
            <Briefcase className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {isCountsLoading ? (
              <div className="text-2xl font-bold text-zinc-300 animate-pulse">--</div>
            ) : countsError ? (
              <div className="text-red-500 text-sm">Error loading counts</div>
            ) : (
              <div className="text-2xl font-bold" data-testid="count-open">{counts?.open}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {isCountsLoading ? (
              <div className="text-2xl font-bold text-zinc-300 animate-pulse">--</div>
            ) : countsError ? (
              <div className="text-red-500 text-sm">Error loading counts</div>
            ) : (
              <div className="text-2xl font-bold" data-testid="count-completed">{counts?.completed}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Storage Quota</CardTitle>
            <HardDrive className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {isQuotaLoading ? (
              <div className="h-8 bg-zinc-100 animate-pulse rounded"></div>
            ) : quota ? (
              <div className="space-y-2">
                <div className="w-full bg-zinc-200 rounded-full h-2.5">
                  <div 
                    className="bg-primary h-2.5 rounded-full" 
                    style={{ width: `${quotaPercent}%` }}
                    data-testid="progress-bar"
                  ></div>
                </div>
                <div className="text-sm text-zinc-500">
                  {formatBytes(quota.storage_used_bytes)} / {formatBytes(quota.storage_quota_bytes)} used
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-500">Not available</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-zinc-500" />
            <CardTitle>User Management</CardTitle>
          </div>
          <Button onClick={() => setInviteModalOpen(true)} size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> Invite User
          </Button>
        </CardHeader>
        <CardContent>
          {isUsersLoading ? (
            <div className="h-32 flex items-center justify-center text-zinc-400">Loading users...</div>
          ) : users ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 border-b">
                  <tr>
                    <th className="px-6 py-3 font-medium">Email</th>
                    <th className="px-6 py-3 font-medium">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user: any) => (
                    <tr key={user.id} className="border-b last:border-0 hover:bg-zinc-50/50">
                      <td className="px-6 py-4">{user.email}</td>
                      <td className="px-6 py-4">
                        <select
                          value={user.role}
                          onChange={(e) => updateRoleMutation.mutate({ id: user.id, role: e.target.value })}
                          className="bg-transparent border-0 border-b border-dashed border-zinc-300 focus:ring-0 cursor-pointer capitalize p-0 pr-4"
                          disabled={updateRoleMutation.isPending}
                          aria-label={`Change role for ${user.email}`}
                        >
                          <option value="owner">Owner</option>
                          <option value="dispatcher">Dispatcher</option>
                          <option value="technician">Technician</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-zinc-500">No users found.</div>
          )}
        </CardContent>
      </Card>

      <Modal 
        isOpen={isInviteModalOpen} 
        onClose={() => setInviteModalOpen(false)}
        title="Invite User"
      >
        <form onSubmit={(e) => { e.preventDefault(); inviteMutation.mutate({ email: inviteEmail, role: inviteRole }); }} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">Email address</label>
            <input 
              id="email" 
              type="email" 
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" 
              placeholder="user@example.com"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="role" className="text-sm font-medium">Role</label>
            <select
              id="role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="owner">Owner</option>
              <option value="dispatcher">Dispatcher</option>
              <option value="technician">Technician</option>
            </select>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setInviteModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? 'Sending...' : 'Send Invite'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default OwnerDashboard;
