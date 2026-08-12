import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '../api/client';
import { DataTable, type Column } from '../components/DataTable';
import { Badge, ErrorState, LoadingState, Toast } from '../components/Feedback';
import { Button, SelectInput, TextInput } from '../components/FormControls';
import { useAuth } from '../context/AuthContext';
import type { ApiResponse, Role } from '../types';
import { formatDateTime, titleCase } from '../utils/format';

interface TeamUser { id: string; name: string; email: string; role: Role; isActive: boolean; createdAt: string }

export default function TeamPage() {
  const { user: currentUser } = useAuth(); const canManage = currentUser?.role === 'owner';
  const client = useQueryClient(); const [showForm, setShowForm] = useState(false); const [toast, setToast] = useState('');
  const [values, setValues] = useState({ name: '', email: '', password: '', role: 'technician' as Role });
  const query = useQuery({ queryKey: ['users'], queryFn: async () => (await apiFetch<ApiResponse<TeamUser[]>>('/users')).data });
  const create = useMutation({ mutationFn: () => apiFetch('/users', { method: 'POST', body: JSON.stringify(values) }), onSuccess: () => { void client.invalidateQueries({ queryKey: ['users'] }); setShowForm(false); setValues({ name: '', email: '', password: '', role: 'technician' }); setToast('Team member created.'); } });
  const toggle = useMutation({ mutationFn: (user: TeamUser) => apiFetch(`/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ isActive: !user.isActive }) }), onSuccess: () => void client.invalidateQueries({ queryKey: ['users'] }) });
  const columns: Column<TeamUser>[] = [
    { key: 'name', header: 'Team member', render: (row) => <div className="primary-cell"><strong>{row.name}</strong><span>{row.email}</span></div> },
    { key: 'role', header: 'Role', render: (row) => <Badge tone={row.role === 'owner' ? 'info' : 'neutral'}>{titleCase(row.role)}</Badge> },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={row.isActive ? 'success' : 'danger'}>{row.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'created', header: 'Joined', render: (row) => formatDateTime(row.createdAt) },
    { key: 'actions', header: '', render: (row) => canManage ? <Button variant="ghost" onClick={() => toggle.mutate(row)}>{row.isActive ? 'Deactivate' : 'Activate'}</Button> : null }
  ];
  return <div className="page">{toast && <Toast message={toast} onDismiss={() => setToast('')} />}<header className="page-header"><div><p className="eyebrow">Administration</p><h1>Team</h1><p>{canManage ? 'Manage access and operational roles.' : 'View your organisation team and roles.'}</p></div>{canManage && <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Close form' : '+ Add team member'}</Button>}</header>
    {showForm && <form className="form-panel compact-form" onSubmit={(event: FormEvent) => { event.preventDefault(); create.mutate(); }}><h2>Add team member</h2>{create.isError && <div className="form-alert">{create.error.message}</div>}<div className="form-grid"><TextInput label="Name" required value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} /><TextInput label="Email" type="email" required value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} /><TextInput label="Temporary password" type="password" required minLength={10} hint="At least 10 characters" value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} /><SelectInput label="Role" value={values.role} onChange={(e) => setValues({ ...values, role: e.target.value as Role })}>{['owner', 'dispatcher', 'technician'].map((role) => <option value={role} key={role}>{titleCase(role)}</option>)}</SelectInput></div><div className="form-actions"><Button type="submit" busy={create.isPending}>Create member</Button></div></form>}
    <section className="panel table-panel">{query.isLoading ? <LoadingState /> : query.isError ? <ErrorState error={query.error} /> : <DataTable columns={columns} rows={query.data ?? []} rowKey={(row) => row.id} />}</section></div>;
}
