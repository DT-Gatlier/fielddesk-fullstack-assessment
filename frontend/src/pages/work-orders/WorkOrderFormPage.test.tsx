import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkOrderFormPage from './WorkOrderFormPage';

describe('work-order creation workflow', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads technician options and submits a persisted work order', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/users?')) return new Response(JSON.stringify({ data: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Tara Technician' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.endsWith('/work-orders') && init?.method === 'POST') return new Response(JSON.stringify({ data: { id } }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const user = userEvent.setup();
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/work-orders/new']}><Routes><Route path="/work-orders/new" element={<WorkOrderFormPage />} /><Route path="/work-orders/:id" element={<div>Created work order</div>} /></Routes></MemoryRouter></QueryClientProvider>);

    await user.type(screen.getByLabelText('Reference number'), 'NW-2001');
    await user.type(screen.getByLabelText('Site name'), 'Warehouse 9');
    await user.type(screen.getByLabelText('Title'), 'Inspect loading dock');
    await user.selectOptions(await screen.findByLabelText('Technician'), '22222222-2222-4222-8222-222222222222');
    await user.click(screen.getByRole('button', { name: 'Create work order' }));

    expect(await screen.findByText('Created work order')).toBeInTheDocument();
    const createCall = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/work-orders') && init?.method === 'POST');
    expect(createCall).toBeDefined();
    const payload = JSON.parse(String(createCall?.[1]?.body));
    expect(payload).toMatchObject({ referenceNumber: 'NW-2001', title: 'Inspect loading dock', assignedTechnicianId: '22222222-2222-4222-8222-222222222222' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
