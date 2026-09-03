import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterAll, afterEach, beforeAll } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OwnerDashboard from './OwnerDashboard';
import '@testing-library/jest-dom';

const handlers = [
  http.get('*/work-orders', ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    if (status === 'open') {
      return HttpResponse.json({ total: 10, data: [] });
    }
    if (status === 'completed') {
      return HttpResponse.json({ total: 25, data: [] });
    }
    return HttpResponse.json({ total: 0, data: [] });
  }),
  http.get('*/organisation/quota', () => {
    return HttpResponse.json({
      storage_used_bytes: 50 * 1024 * 1024,
      storage_quota_bytes: 100 * 1024 * 1024
    });
  }),
  http.get('*/users', () => {
    return HttpResponse.json([
      { id: '1', email: 'owner@test.com', role: 'owner' },
      { id: '2', email: 'tech@test.com', role: 'technician' }
    ]);
  }),
  http.post('*/users', async ({ request }) => {
    const data = await request.json() as { email: string, role: string };
    return HttpResponse.json({ id: '3', email: data.email, role: data.role }, { status: 201 });
  }),
  http.get('*/work-orders/export', () => {
    return new HttpResponse('id,title\n1,Test', {
      headers: {
        'Content-Type': 'text/csv'
      }
    });
  })
];

const server = setupServer(...handlers);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  queryClient.clear();
});
afterAll(() => server.close());

describe('OwnerDashboard', () => {
  it('renders summary counts', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <OwnerDashboard />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('count-open')).toHaveTextContent('10');
      expect(screen.getByTestId('count-completed')).toHaveTextContent('25');
    });
  });

  it('renders storage quota progress bar', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <OwnerDashboard />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Storage Quota')).toBeInTheDocument();
      const progressBar = screen.getByTestId('progress-bar');
      expect(progressBar).toHaveStyle('width: 50%');
    });
  });

  it('renders user management and allows inviting user', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <OwnerDashboard />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('User Management')).toBeInTheDocument();
      expect(screen.getByText('owner@test.com')).toBeInTheDocument();
    });

    const inviteButton = screen.getByRole('button', { name: /invite user/i });
    await userEvent.click(inviteButton);

    const emailInput = screen.getByLabelText(/email/i);
    await userEvent.type(emailInput, 'newtech@test.com');

    const roleSelect = screen.getByLabelText(/role/i);
    await userEvent.selectOptions(roleSelect, 'technician');

    const submitButton = screen.getByRole('button', { name: /send invite/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('newtech@test.com')).toBeInTheDocument();
    });
  });

  it('allows downloading csv export', async () => {
    window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-url');
    const createElementSpy = vi.spyOn(document, 'createElement');
    
    render(
      <QueryClientProvider client={queryClient}>
        <OwnerDashboard />
      </QueryClientProvider>
    );

    const exportButton = await screen.findByRole('button', { name: /export csv/i });
    await userEvent.click(exportButton);

    await waitFor(() => {
      expect(window.URL.createObjectURL).toHaveBeenCalled();
      const mockLink = createElementSpy.mock.results.find(r => r.value.tagName.toLowerCase() === 'a');
      expect(mockLink).toBeDefined();
    });
  });
});
