import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '../api/client';
import { ErrorState, LoadingState, Toast } from '../components/Feedback';
import { Button, TextInput } from '../components/FormControls';
import type { ApiResponse } from '../types';
import { formatBytes } from '../utils/format';

interface Organisation { id: string; name: string; slug: string; timezone: string; storageUsedBytes: number; storageLimitBytes: number }

export default function SettingsPage() {
  const client = useQueryClient(); const [values, setValues] = useState({ name: '', timezone: '', storageLimitMb: '' }); const [toast, setToast] = useState('');
  const query = useQuery({ queryKey: ['organisation'], queryFn: async () => (await apiFetch<ApiResponse<Organisation>>('/organisation')).data });
  useEffect(() => { if (query.data) setValues({ name: query.data.name, timezone: query.data.timezone, storageLimitMb: String(Math.round(query.data.storageLimitBytes / 1024 ** 2)) }); }, [query.data]);
  const save = useMutation({ mutationFn: () => apiFetch('/organisation', { method: 'PUT', body: JSON.stringify({ name: values.name, timezone: values.timezone, storageLimitBytes: Number(values.storageLimitMb) * 1024 ** 2 }) }), onSuccess: () => { void client.invalidateQueries({ queryKey: ['organisation'] }); void client.invalidateQueries({ queryKey: ['dashboard'] }); setToast('Organisation settings saved.'); } });
  if (query.isLoading) return <LoadingState />; if (query.isError || !query.data) return <ErrorState error={query.error} />;
  return <div className="page page--narrow">{toast && <Toast message={toast} onDismiss={() => setToast('')} />}<header className="page-header"><div><p className="eyebrow">Administration</p><h1>Organisation settings</h1><p>Configure your organisation profile and storage policy.</p></div></header><form className="form-panel" onSubmit={(event: FormEvent) => { event.preventDefault(); save.mutate(); }}>
    {save.isError && <div className="form-alert">{save.error.message}</div>}<fieldset><legend>Organisation</legend><div className="form-grid"><TextInput label="Name" required value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} /><TextInput label="Slug" value={query.data.slug} disabled hint="The tenant slug cannot be changed." /><TextInput label="Timezone" required value={values.timezone} hint="Use an IANA timezone such as Asia/Kolkata" onChange={(e) => setValues({ ...values, timezone: e.target.value })} /><TextInput label="Storage limit (MB)" type="number" min={1} required value={values.storageLimitMb} hint={`Currently using ${formatBytes(query.data.storageUsedBytes)}`} onChange={(e) => setValues({ ...values, storageLimitMb: e.target.value })} /></div></fieldset><div className="form-actions"><Button type="submit" busy={save.isPending}>Save settings</Button></div></form></div>;
}
