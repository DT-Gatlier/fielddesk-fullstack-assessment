import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkOrderFormPage } from './WorkOrderFormPage';

const TECHNICIAN = { id: '6d0b7c5e-0000-4000-8000-000000000001', name: 'Tara Technician', email: 't@x.test', role: 'technician', isActive: true };

interface Call {
  method: string;
  url: string;
  body: unknown;
}

/** A small fake of the API: records requests and replies like the real endpoints do. */
function fakeApi(createResponses: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'GET' && url.startsWith('/api/users')) {
      return new Response(JSON.stringify({ data: [TECHNICIAN] }), { status: 200 });
    }
    if (method === 'POST' && url === '/api/work-orders') {
      const next = createResponses.shift()!;
      return new Response(JSON.stringify(next.body), { status: next.status });
    }
    return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'not found' } }), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function DetailStub() {
  const { id } = useParams();
  return <div>Detail page for {id}</div>;
}

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/work-orders/new']}>
        <Routes>
          <Route path="/work-orders/new" element={<WorkOrderFormPage />} />
          <Route path="/work-orders/:id" element={<DetailStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('creating a work order', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('validates locally, surfaces a scheduling conflict from the API, and succeeds after the dispatcher fixes it', async () => {
    const user = userEvent.setup();
    const calls = fakeApi([
      {
        status: 409,
        body: {
          error: {
            code: 'SCHEDULE_CONFLICT',
            message: 'The technician is already assigned to an overlapping work order.',
            details: [{ path: 'scheduledStart', message: 'Overlaps WO-000042 (2031-03-01T09:00:00.000Z – 2031-03-01T11:00:00.000Z)' }],
            requestId: 'req-1',
          },
        },
      },
      {
        status: 201,
        body: { data: { id: 'new-work-order-id', reference: 'WO-000043' } },
      },
    ]);
    renderForm();

    // Required fields are checked before anything is sent.
    await user.click(screen.getByRole('button', { name: 'Create work order' }));
    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(screen.getByText('Site is required.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    await user.type(screen.getByLabelText('Title'), 'Replace pump');
    await user.type(screen.getByLabelText('Site'), 'Plant room');
    await screen.findByRole('option', { name: TECHNICIAN.name });
    await user.selectOptions(screen.getByLabelText('Technician'), TECHNICIAN.id);
    await user.type(screen.getByLabelText('Scheduled start'), '2031-03-01T10:00');
    await user.type(screen.getByLabelText('Scheduled end'), '2031-03-01T09:00');

    await user.click(screen.getByRole('button', { name: 'Create work order' }));
    expect(screen.getByText('End must be after start.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    await user.clear(screen.getByLabelText('Scheduled end'));
    await user.type(screen.getByLabelText('Scheduled end'), '2031-03-01T12:00');
    await user.click(screen.getByRole('button', { name: 'Create work order' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Scheduling conflict');
    expect(alert).toHaveTextContent('Overlaps WO-000042');

    const firstPost = calls.find((c) => c.method === 'POST')!;
    expect(firstPost.body).toMatchObject({
      title: 'Replace pump',
      siteName: 'Plant room',
      assignedTechnicianId: TECHNICIAN.id,
      scheduledStart: new Date('2031-03-01T10:00').toISOString(),
      scheduledEnd: new Date('2031-03-01T12:00').toISOString(),
    });
    // The client never sends organisation or creator: the server derives them from the session.
    expect(firstPost.body).not.toHaveProperty('orgId');
    expect(firstPost.body).not.toHaveProperty('createdBy');

    // Move to a free slot and resubmit.
    await user.clear(screen.getByLabelText('Scheduled start'));
    await user.type(screen.getByLabelText('Scheduled start'), '2031-03-01T13:00');
    await user.clear(screen.getByLabelText('Scheduled end'));
    await user.type(screen.getByLabelText('Scheduled end'), '2031-03-01T14:00');
    await user.click(screen.getByRole('button', { name: 'Create work order' }));

    await waitFor(() => expect(screen.getByText('Detail page for new-work-order-id')).toBeInTheDocument());
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
  });
});
