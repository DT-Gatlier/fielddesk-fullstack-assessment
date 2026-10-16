import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PRIORITIES, type Priority, type WorkOrder, type WorkOrderDetail } from '../api/types';
import { Icon } from '../components/icons';
import { Button, ErrorBanner, Field, Input, LoadingBlock, PageHeader, Panel, Select, Textarea } from '../components/ui';
import { useTechnicians } from '../hooks';
import { fromLocalInput, priorityLabel } from '../lib/format';

interface FormState {
  title: string;
  description: string;
  priority: Priority;
  siteName: string;
  technicianId: string;
  start: string;
  end: string;
}
const EMPTY: FormState = { title: '', description: '', priority: 'medium', siteName: '', technicianId: '', start: '', end: '' };

/** Client-side checks give instant feedback; the API repeats every one of them. */
function validate(f: FormState, creating: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.title.trim()) e.title = 'Enter a title';
  if (!f.siteName.trim()) e.siteName = 'Enter the site name';
  if (creating) {
    if (!!f.start !== !!f.end) e[f.start ? 'scheduledEnd' : 'scheduledStart'] = 'Set both a start and an end time';
    if (f.start && f.end && new Date(f.end) <= new Date(f.start)) e.scheduledEnd = 'End must be after the start';
    if (f.technicianId && !f.start) e.scheduledStart = 'Schedule a time to assign a technician';
  }
  return e;
}

export function WorkOrderFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const technicians = useTechnicians();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState(false);

  const existing = useQuery({
    queryKey: ['work-order', id],
    queryFn: () => api<{ data: WorkOrderDetail }>(`/work-orders/${id}`).then((r) => r.data),
    enabled: editing,
  });
  useEffect(() => {
    if (existing.data) {
      const w = existing.data;
      setForm({ ...EMPTY, title: w.title, description: w.description, priority: w.priority, siteName: w.siteName });
    }
  }, [existing.data]);

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const base = { title: f.title, description: f.description, priority: f.priority, siteName: f.siteName };
      if (editing) {
        return api<{ data: WorkOrder }>(`/work-orders/${id}`, { method: 'PATCH', json: { ...base, version: existing.data!.version } });
      }
      return api<{ data: WorkOrder }>('/work-orders', {
        method: 'POST',
        json: {
          ...base,
          ...(f.start || f.end ? { scheduledStart: fromLocalInput(f.start), scheduledEnd: fromLocalInput(f.end) } : {}),
          ...(f.technicianId ? { technicianId: f.technicianId } : {}),
        },
      });
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['work-orders'] });
      void qc.invalidateQueries({ queryKey: ['summary'] });
      void qc.invalidateQueries({ queryKey: ['work-order', res.data.id] });
      navigate(`/work-orders/${res.data.id}`);
    },
  });

  const clientErrors = touched ? validate(form, !editing) : {};
  const serverErrors = save.error instanceof ApiError ? save.error.fieldErrors : {};
  const errors = { ...serverErrors, ...clientErrors };
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(validate(form, !editing)).length) return;
    save.mutate(form);
  }

  if (editing && existing.isLoading) return <LoadingBlock />;
  if (editing && existing.error) return <ErrorBanner error={existing.error} />;

  const showBanner = save.error && !(save.error instanceof ApiError && save.error.code === 'VALIDATION_FAILED');

  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <PageHeader
        eyebrow={
          <Link to={editing ? `/work-orders/${id}` : '/work-orders'} className="inline-flex items-center gap-1.5 font-medium text-ink-soft hover:text-ink">
            <Icon name="arrowLeft" className="h-3.5 w-3.5" />
            {editing ? 'Back to work order' : 'Back to work orders'}
          </Link>
        }
        title={editing ? `Edit ${existing.data?.reference}` : 'New work order'}
        description={editing ? 'Update the job description, site and priority.' : 'Describe the job, then optionally schedule it and assign a technician.'}
      />
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {showBanner && <ErrorBanner error={save.error} />}
        <Panel title="Details" icon="file" description="What the technician needs to know">
          <div className="space-y-4">
            <Field label="Title" error={errors.title}>
              {(fid, d) => <Input id={fid} aria-describedby={d} aria-invalid={!!errors.title} value={form.title} onChange={set('title')} maxLength={200} />}
            </Field>
            <Field label="Description" error={errors.description} hint="What needs doing, access notes, parts required.">
              {(fid, d) => <Textarea id={fid} aria-describedby={d} rows={4} value={form.description} onChange={set('description')} maxLength={5000} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Site" error={errors.siteName}>
                {(fid, d) => <Input id={fid} aria-describedby={d} aria-invalid={!!errors.siteName} value={form.siteName} onChange={set('siteName')} maxLength={200} />}
              </Field>
              <Field label="Priority" error={errors.priority}>
                {(fid) => (
                  <Select id={fid} value={form.priority} onChange={set('priority')}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{priorityLabel[p]}</option>)}
                  </Select>
                )}
              </Field>
            </div>
          </div>
        </Panel>

        {!editing && (
          <Panel title="Schedule and assignment (optional)" icon="calendar" description="Overlapping bookings for a technician are rejected">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start" error={errors.scheduledStart}>
                {(fid, d) => <Input id={fid} aria-describedby={d} aria-invalid={!!errors.scheduledStart} type="datetime-local" value={form.start} onChange={set('start')} />}
              </Field>
              <Field label="End" error={errors.scheduledEnd}>
                {(fid, d) => <Input id={fid} aria-describedby={d} aria-invalid={!!errors.scheduledEnd} type="datetime-local" value={form.end} onChange={set('end')} />}
              </Field>
              <div className="sm:col-span-2">
                <Field label="Technician" error={errors.technicianId} hint="Technicians are notified when assigned.">
                  {(fid, d) => (
                    <Select id={fid} aria-describedby={d} value={form.technicianId} onChange={set('technicianId')}>
                      <option value="">Leave unassigned</option>
                      {technicians.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>
                  )}
                </Field>
              </div>
            </div>
          </Panel>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" variant="primary" busy={save.isPending}>
            {editing ? 'Save changes' : 'Create work order'}
          </Button>
        </div>
      </form>
    </div>
  );
}
