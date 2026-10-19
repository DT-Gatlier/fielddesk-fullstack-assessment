import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, formatBytes, label } from '../api';
import { useAuth } from '../auth';
import { ErrorBanner, Field, Loading } from '../components';

interface Organisation {
  id: string;
  name: string;
  storageLimitBytes: number;
  storageUsedBytes: number;
}

const MB = 1024 * 1024;

export function SettingsPage() {
  const { can } = useAuth();
  return (
    <section className="narrow">
      <h1>Settings</h1>
      <OrganisationSettings editable={can('owner')} />
      <MockProviderSettings />
    </section>
  );
}

function OrganisationSettings({ editable }: { editable: boolean }) {
  const queryClient = useQueryClient();
  const org = useQuery({
    queryKey: ['organisation'],
    queryFn: () => api<{ data: Organisation }>('/api/organisation').then((r) => r.data),
  });
  const [name, setName] = useState('');
  const [limitMb, setLimitMb] = useState('');
  useEffect(() => {
    if (org.data) {
      setName(org.data.name);
      setLimitMb(String(Math.round(org.data.storageLimitBytes / MB)));
    }
  }, [org.data]);

  const save = useMutation({
    mutationFn: () =>
      api<{ data: Organisation }>('/api/organisation', {
        method: 'PATCH',
        json: { name, storageLimitBytes: Math.round(Number(limitMb) * MB) },
      }),
    onSuccess: ({ data }) => {
      queryClient.setQueryData(['organisation'], data);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  if (org.isLoading) return <Loading />;
  if (org.error) return <ErrorBanner error={org.error} />;
  const data = org.data!;
  const used = Math.min(100, (data.storageUsedBytes / Math.max(1, data.storageLimitBytes)) * 100);
  const errors = save.error instanceof ApiError ? save.error.fieldErrors() : {};

  return (
    <form
      className="card form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <h2>Organisation</h2>
      <div>
        Storage: {formatBytes(data.storageUsedBytes)} of {formatBytes(data.storageLimitBytes)}
        <div className="meter" role="meter" aria-valuenow={used} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${used}%` }} />
        </div>
      </div>
      {editable ? (
        <>
          {save.error && <ErrorBanner error={save.error} />}
          {save.isSuccess && <div className="alert alert-ok">Saved.</div>}
          <Field label="Name" error={errors.name}>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Storage limit (MB)" error={errors.storageLimitBytes}>
            <input type="number" min={0} value={limitMb} onChange={(e) => setLimitMb(e.target.value)} />
          </Field>
          <button type="submit" disabled={save.isPending}>
            Save
          </button>
        </>
      ) : (
        <p className="muted">Only owners can change organisation settings.</p>
      )}
    </form>
  );
}

function MockProviderSettings() {
  const queryClient = useQueryClient();
  const mode = useQuery({
    queryKey: ['mock-provider'],
    queryFn: () => api<{ data: { mode: string; modes: string[] } }>('/api/dev/mock-provider').then((r) => r.data),
    retry: false,
  });
  const change = useMutation({
    mutationFn: (next: string) => api('/api/dev/mock-provider', { method: 'PUT', json: { mode: next } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['mock-provider'] }),
  });

  // The endpoint does not exist in production builds.
  if (mode.error) return null;
  return (
    <div className="card form">
      <h2>Notification provider (demo)</h2>
      <p className="muted small">Controls how the mock provider responds to the worker, to demonstrate retries and failures.</p>
      <ErrorBanner error={change.error} />
      {mode.data && (
        <div className="row wrap">
          {mode.data.modes.map((m) => (
            <label key={m} className="radio">
              <input type="radio" name="mode" checked={mode.data.mode === m} onChange={() => change.mutate(m)} />
              {label(m)}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
