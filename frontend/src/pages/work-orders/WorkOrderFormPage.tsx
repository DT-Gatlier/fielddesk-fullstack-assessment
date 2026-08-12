import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiFetch } from '../../api/client';
import { AsyncSelect } from '../../components/AsyncSelect';
import { ErrorState, LoadingState } from '../../components/Feedback';
import { Button, SelectInput, TextArea, TextInput } from '../../components/FormControls';
import type { ApiResponse, WorkOrder, WorkOrderInput } from '../../types';
import { titleCase, toDateTimeLocal } from '../../utils/format';

const empty: WorkOrderInput = { referenceNumber: '', title: '', description: '', priority: 'medium', status: 'draft', assignedTechnicianId: null, scheduledStart: null, scheduledEnd: null, siteName: '' };

export default function WorkOrderFormPage() {
  const { id } = useParams(); const editing = Boolean(id); const navigate = useNavigate(); const queryClient = useQueryClient();
  const [values, setValues] = useState(empty); const [scheduleError, setScheduleError] = useState(''); const [availability, setAvailability] = useState<string>('');
  const detail = useQuery({ queryKey: ['work-order', id], queryFn: async () => (await apiFetch<ApiResponse<WorkOrder>>(`/work-orders/${id}`)).data, enabled: editing });
  useEffect(() => { if (detail.data) setValues({ referenceNumber: detail.data.referenceNumber, title: detail.data.title, description: detail.data.description, priority: detail.data.priority, status: detail.data.status, assignedTechnicianId: detail.data.assignedTechnicianId, scheduledStart: toDateTimeLocal(detail.data.scheduledStart), scheduledEnd: toDateTimeLocal(detail.data.scheduledEnd), siteName: detail.data.siteName }); }, [detail.data]);

  const save = useMutation({ mutationFn: (payload: WorkOrderInput) => apiFetch<ApiResponse<WorkOrder>>(editing ? `/work-orders/${id}` : '/work-orders', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) }), onSuccess: (result) => { void queryClient.invalidateQueries({ queryKey: ['work-orders'] }); void queryClient.invalidateQueries({ queryKey: ['dashboard'] }); navigate(`/work-orders/${result.data.id}`); }, onError: (error) => { if (error instanceof ApiError && error.status === 409) setScheduleError(error.message); } });
  const set = <K extends keyof WorkOrderInput>(key: K, value: WorkOrderInput[K]) => { setValues((current) => ({ ...current, [key]: value })); if (['assignedTechnicianId', 'scheduledStart', 'scheduledEnd'].includes(key)) { setScheduleError(''); setAvailability(''); } };

  async function checkAvailability() {
    if (!values.assignedTechnicianId || !values.scheduledStart || !values.scheduledEnd) return;
    setAvailability('Checking…');
    try {
      const search = new URLSearchParams({ technicianId: values.assignedTechnicianId, start: new Date(values.scheduledStart).toISOString(), end: new Date(values.scheduledEnd).toISOString() }); if (id) search.set('excludeWorkOrderId', id);
      const result = await apiFetch<ApiResponse<{ available: boolean; conflicts: WorkOrder[] }>>(`/technicians/availability?${search}`);
      setAvailability(result.data.available ? 'Available for this time window.' : `Unavailable: conflicts with ${result.data.conflicts.map((item) => item.referenceNumber).join(', ')}.`);
    } catch (error) { setAvailability(error instanceof Error ? error.message : 'Availability check failed.'); }
  }

  function submit(event: FormEvent) {
    event.preventDefault(); setScheduleError('');
    if (Boolean(values.scheduledStart) !== Boolean(values.scheduledEnd)) { setScheduleError('Start and end must both be provided.'); return; }
    if (values.scheduledStart && values.scheduledEnd && new Date(values.scheduledStart) >= new Date(values.scheduledEnd)) { setScheduleError('End must be after start.'); return; }
    save.mutate({ ...values, assignedTechnicianId: values.assignedTechnicianId || null, scheduledStart: values.scheduledStart ? new Date(values.scheduledStart).toISOString() : null, scheduledEnd: values.scheduledEnd ? new Date(values.scheduledEnd).toISOString() : null });
  }
  if (editing && detail.isLoading) return <LoadingState label="Loading work order" />;
  if (editing && detail.isError) return <ErrorState error={detail.error} />;
  return <div className="page page--narrow"><div className="breadcrumbs"><Link to="/work-orders">Work orders</Link><span>/</span><span>{editing ? 'Edit' : 'New'}</span></div>
    <header className="page-header"><div><p className="eyebrow">{editing ? 'Update work' : 'Create work'}</p><h1>{editing ? `Edit ${detail.data?.referenceNumber ?? 'work order'}` : 'New work order'}</h1><p>Provide job details, assignment, and schedule.</p></div></header>
    <form className="form-panel" onSubmit={submit}>
      {save.isError && !scheduleError && <div className="form-alert" role="alert">{save.error instanceof Error ? save.error.message : 'Could not save the work order.'}</div>}
      <fieldset><legend>Job information</legend><div className="form-grid"><TextInput label="Reference number" required maxLength={50} value={values.referenceNumber} onChange={(event) => set('referenceNumber', event.target.value)} /><TextInput label="Site name" required maxLength={200} value={values.siteName} onChange={(event) => set('siteName', event.target.value)} /><TextInput label="Title" className="grid-span-2" required maxLength={200} value={values.title} onChange={(event) => set('title', event.target.value)} /><TextArea label="Description" className="grid-span-2" rows={5} maxLength={10000} value={values.description} onChange={(event) => set('description', event.target.value)} /></div></fieldset>
      <fieldset><legend>Workflow</legend><div className="form-grid"><SelectInput label="Priority" value={values.priority} onChange={(event) => set('priority', event.target.value as WorkOrderInput['priority'])}>{['low', 'medium', 'high', 'urgent'].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</SelectInput><SelectInput label="Status" value={values.status} onChange={(event) => set('status', event.target.value as WorkOrderInput['status'])}>{['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</SelectInput></div></fieldset>
      <fieldset><legend>Assignment and schedule</legend><div className="form-grid"><AsyncSelect label="Technician" path="/users?role=technician&active=true&limit=100" labelKey="name" value={values.assignedTechnicianId ?? ''} onChange={(value) => set('assignedTechnicianId', value || null)} placeholder="Unassigned" /><div />
        <TextInput label="Scheduled start" type="datetime-local" value={values.scheduledStart ?? ''} error={scheduleError || undefined} onChange={(event) => set('scheduledStart', event.target.value || null)} /><TextInput label="Scheduled end" type="datetime-local" value={values.scheduledEnd ?? ''} error={scheduleError || undefined} onChange={(event) => set('scheduledEnd', event.target.value || null)} />
      </div><div className="availability-row"><button type="button" className="text-button" disabled={!values.assignedTechnicianId || !values.scheduledStart || !values.scheduledEnd} onClick={() => void checkAvailability()}>Check technician availability</button>{availability && <span className={availability.startsWith('Available') ? 'success-text' : 'warning-text'}>{availability}</span>}</div></fieldset>
      <div className="form-actions"><Link className="button button--ghost" to={editing ? `/work-orders/${id}` : '/work-orders'}>Cancel</Link><Button type="submit" busy={save.isPending}>{editing ? 'Save changes' : 'Create work order'}</Button></div>
    </form>
  </div>;
}
