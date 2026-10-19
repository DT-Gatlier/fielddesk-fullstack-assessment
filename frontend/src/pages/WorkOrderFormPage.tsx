import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  ApiError,
  fromLocalInput,
  label,
  PRIORITIES,
  STATUSES,
  toLocalInput,
  type Priority,
  type Status,
  type User,
  type WorkOrder,
} from '../api';
import { ErrorBanner, Field, Loading } from '../components';

interface FormState {
  title: string;
  description: string;
  priority: Priority;
  siteName: string;
  assignedTechnicianId: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: Status;
}

const EMPTY: FormState = {
  title: '',
  description: '',
  priority: 'medium',
  siteName: '',
  assignedTechnicianId: '',
  scheduledStart: '',
  scheduledEnd: '',
  status: 'open',
};

/** Mirrors server-side rules for instant feedback. The API remains the authority. */
function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.title.trim()) errors.title = 'Title is required.';
  if (!form.siteName.trim()) errors.siteName = 'Site is required.';
  if (!!form.scheduledStart !== !!form.scheduledEnd) errors.scheduledEnd = 'Provide both a start and an end, or neither.';
  else if (form.scheduledStart && new Date(form.scheduledEnd) <= new Date(form.scheduledStart)) {
    errors.scheduledEnd = 'End must be after start.';
  }
  return errors;
}

export function WorkOrderFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const existing = useQuery({
    queryKey: ['work-order', id],
    queryFn: () => api<{ data: WorkOrder }>(`/api/work-orders/${id}`).then((r) => r.data),
    enabled: editing,
  });
  const technicians = useQuery({
    queryKey: ['technicians'],
    queryFn: () => api<{ data: User[] }>('/api/users?role=technician').then((r) => r.data.filter((u) => u.isActive)),
  });

  useEffect(() => {
    if (!existing.data) return;
    const w = existing.data;
    setForm({
      title: w.title,
      description: w.description,
      priority: w.priority,
      siteName: w.siteName,
      assignedTechnicianId: w.assignedTechnician?.id ?? '',
      scheduledStart: toLocalInput(w.scheduledStart),
      scheduledEnd: toLocalInput(w.scheduledEnd),
      status: w.status,
    });
  }, [existing.data]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: form.title,
        description: form.description,
        priority: form.priority,
        siteName: form.siteName,
        assignedTechnicianId: form.assignedTechnicianId || null,
        scheduledStart: fromLocalInput(form.scheduledStart),
        scheduledEnd: fromLocalInput(form.scheduledEnd),
      };
      return editing
        ? api<{ data: WorkOrder }>(`/api/work-orders/${id}`, {
            method: 'PATCH',
            json: { ...body, version: existing.data!.version, ...(form.status !== existing.data!.status ? { status: form.status } : {}) },
          })
        : api<{ data: WorkOrder }>('/api/work-orders', { json: body });
    },
    onSuccess: ({ data }) => {
      void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['work-order', data.id] });
      navigate(`/work-orders/${data.id}`);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const errors = validate(form);
    setClientErrors(errors);
    if (Object.keys(errors).length === 0) save.mutate();
  }

  if (editing && existing.isLoading) return <Loading what="Loading work order" />;
  if (editing && existing.error) return <ErrorBanner error={existing.error} />;

  const apiError = save.error instanceof ApiError ? save.error : null;
  const errors = { ...apiError?.fieldErrors(), ...clientErrors };
  const set = <K extends keyof FormState>(key: K) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value as FormState[K] }));

  return (
    <section className="narrow">
      <h1>{editing ? `Edit ${existing.data?.reference}` : 'New work order'}</h1>

      {apiError?.code === 'SCHEDULE_CONFLICT' && (
        <div className="alert alert-warn" role="alert">
          <strong>Scheduling conflict.</strong> {apiError.message}
          <ul>
            {apiError.details.map((d, i) => (
              <li key={i}>{d.message}</li>
            ))}
          </ul>
          Choose another time or technician.
        </div>
      )}
      {apiError?.code === 'VERSION_CONFLICT' && (
        <div className="alert alert-warn" role="alert">
          {apiError.message}{' '}
          <button
            className="secondary"
            type="button"
            onClick={() => {
              save.reset();
              void existing.refetch();
            }}
          >
            Reload latest
          </button>
        </div>
      )}
      {save.error && !['SCHEDULE_CONFLICT', 'VERSION_CONFLICT', 'VALIDATION_FAILED'].includes(apiError?.code ?? '') && (
        <ErrorBanner error={save.error} />
      )}

      <form className="card form" onSubmit={onSubmit} noValidate>
        <Field label="Title" error={errors.title}>
          <input value={form.title} onChange={set('title')} maxLength={200} />
        </Field>
        <Field label="Site" error={errors.siteName}>
          <input value={form.siteName} onChange={set('siteName')} maxLength={200} />
        </Field>
        <Field label="Description" error={errors.description}>
          <textarea value={form.description} onChange={set('description')} rows={4} maxLength={10000} />
        </Field>
        <div className="grid-2">
          <Field label="Priority" error={errors.priority}>
            <select value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {label(p)}
                </option>
              ))}
            </select>
          </Field>
          {editing && (
            <Field label="Status" error={errors.status}>
              <select value={form.status} onChange={set('status')}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <Field label="Technician" error={errors.assignedTechnicianId}>
          <select value={form.assignedTechnicianId} onChange={set('assignedTechnicianId')} disabled={technicians.isLoading}>
            <option value="">Unassigned</option>
            {technicians.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid-2">
          <Field label="Scheduled start" error={errors.scheduledStart}>
            <input type="datetime-local" value={form.scheduledStart} onChange={set('scheduledStart')} />
          </Field>
          <Field label="Scheduled end" error={errors.scheduledEnd}>
            <input type="datetime-local" value={form.scheduledEnd} onChange={set('scheduledEnd')} />
          </Field>
        </div>
        <div className="row">
          <button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create work order'}
          </button>
          <Link className="button secondary" to={editing ? `/work-orders/${id}` : '/work-orders'}>
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
