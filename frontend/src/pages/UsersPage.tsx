import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, ApiError, label, type Role, type User } from '../api';
import { useAuth } from '../auth';
import { ErrorBanner, Field, Loading } from '../components';

const ROLES: Role[] = ['owner', 'dispatcher', 'technician'];

export function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<{ data: User[] }>('/api/users').then((r) => r.data) });

  const update = useMutation({
    mutationFn: ({ id, ...changes }: { id: string; role?: Role; isActive?: boolean }) =>
      api(`/api/users/${id}`, { method: 'PATCH', json: changes }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <section>
      <h1>Users</h1>
      <ErrorBanner error={users.error ?? update.error} />
      {users.isLoading && <Loading />}
      {users.data && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <td data-label="Name">{u.name}</td>
                  <td data-label="Email">{u.email}</td>
                  <td data-label="Role">
                    <select
                      aria-label={`Role for ${u.name}`}
                      value={u.role}
                      disabled={update.isPending}
                      onChange={(e) => update.mutate({ id: u.id, role: e.target.value as Role })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {label(r)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Status">
                    <button
                      className="secondary"
                      disabled={update.isPending || u.id === me?.id}
                      onClick={() => update.mutate({ id: u.id, isActive: !u.isActive })}
                    >
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CreateUser />
    </section>
  );
}

function CreateUser() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', role: 'technician' as Role, password: '' });
  const create = useMutation({
    mutationFn: () => api('/api/users', { json: form }),
    onSuccess: () => {
      setForm({ name: '', email: '', role: 'technician', password: '' });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['technicians'] });
    },
  });
  const errors = create.error instanceof ApiError ? create.error.fieldErrors() : {};
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <form className="card form narrow" onSubmit={onSubmit} noValidate>
      <h2>Add user</h2>
      {create.error && !(create.error instanceof ApiError && create.error.code === 'VALIDATION_FAILED') && (
        <ErrorBanner error={create.error} />
      )}
      <Field label="Name" error={errors.name}>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Email" error={errors.email}>
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label="Role" error={errors.role}>
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {label(r)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Initial password (min. 12 characters)" error={errors.password}>
        <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>
      <button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Adding…' : 'Add user'}
      </button>
    </form>
  );
}
