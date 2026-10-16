import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { Organisation, Role, User } from '../api/types';
import { useAuth } from '../auth';
import { Avatar, Button, ErrorBanner, Field, Input, LoadingBlock, PageHeader, Panel, Select, SuccessNote, cx } from '../components/ui';
import { formatBytes } from '../lib/format';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', dispatcher: 'Dispatcher', technician: 'Technician' };

/** Owner-only: users, roles and organisation settings. */
export function TeamPage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users', 'all'], queryFn: () => api<{ data: User[] }>('/users').then((r) => r.data) });
  const org = useQuery({ queryKey: ['organisation'], queryFn: () => api<{ data: Organisation }>('/organisation').then((r) => r.data) });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<User, 'role' | 'isActive'>> }) =>
      api(`/users/${id}`, { method: 'PATCH', json: patch }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const activeCount = users.data?.filter((u) => u.isActive).length;

  return (
    <div className="space-y-7">
      <PageHeader title="Team and settings" description="Manage who can use FieldDesk and what they can do." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="People"
          icon="users"
          description={users.data ? `${activeCount} active of ${users.data.length}` : undefined}
          className="self-start lg:col-span-2"
          flush
        >
          {users.isLoading ? <LoadingBlock /> : users.error ? <div className="p-5"><ErrorBanner error={users.error} /></div> : (
            <>
              {update.error && <div className="px-5 pt-4"><ErrorBanner error={update.error} /></div>}
              <ul className="divide-y divide-line-soft">
                {users.data!.map((u) => {
                  const self = u.id === me?.user.id;
                  return (
                    <li key={u.id} className={cx('flex flex-wrap items-center justify-between gap-3 px-5 py-3.5', !u.isActive && 'bg-canvas/50')}>
                      <div className={cx('flex min-w-0 items-center gap-3', !u.isActive && 'opacity-60')}>
                        <Avatar name={u.name} />
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-medium">
                            {u.name}
                            {self && <span className="rounded-full bg-action-tint px-2 py-px text-[11px] font-medium text-action-strong">You</span>}
                            {!u.isActive && <span className="rounded-full bg-line-soft px-2 py-px text-[11px] font-medium text-ink-soft">Deactivated</span>}
                          </p>
                          <p className="text-xs text-ink-soft break-all">{u.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select aria-label={`Role for ${u.name}`} className="h-8 w-auto text-[13px]" value={u.role} disabled={self || update.isPending}
                          onChange={(e) => update.mutate({ id: u.id, patch: { role: e.target.value as Role } })}>
                          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </Select>
                        <Button type="button" size="sm" variant={u.isActive ? 'ghost' : 'primary'}
                          disabled={self || update.isPending}
                          onClick={() => update.mutate({ id: u.id, patch: { isActive: !u.isActive } })}>
                          {u.isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>
        <div className="space-y-6">
          <OrganisationPanel org={org.data} loading={org.isLoading} error={org.error} />
          <AddUser />
        </div>
      </div>
    </div>
  );
}

function OrganisationPanel({ org, loading, error }: { org?: Organisation; loading: boolean; error: unknown }) {
  const qc = useQueryClient();
  const [name, setName] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (n: string) => api('/organisation', { method: 'PATCH', json: { name: n } }),
    onSuccess: () => {
      setName(null);
      void qc.invalidateQueries({ queryKey: ['organisation'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  if (loading) return <Panel title="Organisation" icon="building"><LoadingBlock /></Panel>;
  if (error || !org) return <Panel title="Organisation" icon="building"><ErrorBanner error={error} /></Panel>;
  const pct = org.storage.limitBytes ? Math.min(100, (org.storage.usedBytes / org.storage.limitBytes) * 100) : 0;
  return (
    <Panel title="Organisation" icon="building">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (name?.trim()) save.mutate(name.trim()); }}>
        <Field label="Name">{(id) => <Input id={id} value={name ?? org.name} onChange={(e) => setName(e.target.value)} maxLength={120} />}</Field>
        {save.error && <ErrorBanner error={save.error} />}
        <Button type="submit" size="sm" busy={save.isPending} disabled={name === null || name.trim() === org.name}>Save name</Button>
      </form>
      <div className="mt-6 rounded-lg border border-line-soft bg-canvas/60 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-medium">Attachment storage</p>
          <p className="tabular text-xs font-medium text-ink-soft">{Math.round(pct)}%</p>
        </div>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className={cx('h-full rounded-full transition-[width] duration-500', pct > 90 ? 'bg-danger' : 'bg-gradient-to-r from-indigo-400 to-action')} style={{ width: `${pct}%` }} />
        </div>
        <p className="tabular mt-2 text-xs text-ink-soft">{formatBytes(org.storage.usedBytes)} of {formatBytes(org.storage.limitBytes)} used</p>
      </div>
    </Panel>
  );
}

function AddUser() {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', email: '', role: 'technician' as Role, password: '' });
  const create = useMutation({
    mutationFn: () => api('/users', { method: 'POST', json: f }),
    onSuccess: () => {
      setF({ name: '', email: '', role: 'technician', password: '' });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
  const errs = create.error instanceof ApiError ? create.error.fieldErrors : {};
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }
  return (
    <Panel title="Add a person" icon="userPlus">
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Field label="Name" error={errs.name}>{(id) => <Input id={id} value={f.name} onChange={set('name')} />}</Field>
        <Field label="Email" error={errs.email}>{(id) => <Input id={id} type="email" value={f.email} onChange={set('email')} />}</Field>
        <Field label="Role">
          {(id) => (
            <Select id={id} value={f.role} onChange={set('role')}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Temporary password" error={errs.password} hint="At least 12 characters.">
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={f.password} onChange={set('password')} />}
        </Field>
        {create.error && !Object.keys(errs).length && <ErrorBanner error={create.error} />}
        {create.isSuccess && <SuccessNote>Person added.</SuccessNote>}
        <Button type="submit" variant="primary" busy={create.isPending} className="w-full" disabled={!f.name || !f.email || !f.password}>Add person</Button>
      </form>
    </Panel>
  );
}
