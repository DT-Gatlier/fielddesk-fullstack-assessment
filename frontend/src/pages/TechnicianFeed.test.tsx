import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, afterAll, afterEach, beforeAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TechnicianFeed from './TechnicianFeed';
import '@testing-library/jest-dom';

let mockWorkOrdersList = [
  {
    id: '1',
    title: 'Fix AC Unit',
    description: 'The AC unit is blowing warm air.',
    location: 'Building A',
    status: 'assigned',
    created_at: '2023-10-01T10:00:00Z',
    priority: 'high'
  },
  {
    id: '2',
    title: 'Repair Plumbing',
    description: 'Leak in the kitchen sink.',
    location: 'Building B',
    status: 'in_progress',
    created_at: '2023-10-02T11:00:00Z',
    priority: 'medium'
  }
];

const handlers = [
  http.get('*/work-orders', () => {
    return HttpResponse.json({ data: mockWorkOrdersList });
  }),
  http.post('*/work-orders/:id/progress', async ({ params, request }) => {
    const { id } = params;
    const body = await request.json() as any;
    
    // Update local state so refetch works
    mockWorkOrdersList = mockWorkOrdersList.map(wo => 
      wo.id === id ? { ...wo, status: body.status_to } : wo
    );
    
    return HttpResponse.json({ id: 'progress_event_1', work_order_id: id, status_to: body.status_to });
  }),
  http.post('*/attachments', async () => {
    return HttpResponse.json({ id: 'attachment_1', file_name: 'test.png', file_size: 1024, content_type: 'image/png' }, { status: 201 });
  })
];

const server = setupServer(...handlers);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
    mutations: {
      retry: false,
    }
  },
});

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  queryClient.clear();
  // Reset state
  mockWorkOrdersList = [
    {
      id: '1',
      title: 'Fix AC Unit',
      description: 'The AC unit is blowing warm air.',
      location: 'Building A',
      status: 'assigned',
      created_at: '2023-10-01T10:00:00Z',
      priority: 'high'
    },
    {
      id: '2',
      title: 'Repair Plumbing',
      description: 'Leak in the kitchen sink.',
      location: 'Building B',
      status: 'in_progress',
      created_at: '2023-10-02T11:00:00Z',
      priority: 'medium'
    }
  ];
});
afterAll(() => server.close());

describe('TechnicianFeed', () => {
  it('renders loading state initially', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TechnicianFeed />
      </QueryClientProvider>
    );
    expect(screen.getByText(/loading your assignments/i)).toBeInTheDocument();
  });

  it('renders work orders', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TechnicianFeed />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Fix AC Unit')).toBeInTheDocument();
      expect(screen.getByText('Repair Plumbing')).toBeInTheDocument();
    });
  });

  it('taps card to open execution view and uploads file', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <TechnicianFeed />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Fix AC Unit')).toBeInTheDocument();
    });

    // Click card to open execution view
    await user.click(screen.getByText('Fix AC Unit'));

    // Check modal opened (detail view)
    // We don't have role="dialog", so we check for modal title
    expect(screen.getByRole('button', { name: /start work/i })).toBeInTheDocument();

    // Upload attachment
    const fileInput = screen.getByLabelText(/upload/i) || screen.getByTestId('file-upload');
    const file = new File(['hello'], 'hello.png', { type: 'image/png' });
    await user.upload(fileInput, file);
    
    // Wait for attachment to appear
    await waitFor(() => {
      expect(screen.getByText('test.png')).toBeInTheDocument();
    });
  });

  it('transitions state to in_progress and completed', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <TechnicianFeed />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Fix AC Unit')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Fix AC Unit'));

    const startWorkBtn = screen.getByRole('button', { name: /start work/i });
    await user.click(startWorkBtn);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /start work/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /complete work/i })).toBeInTheDocument();
    });

    const completeWorkBtn = screen.getByRole('button', { name: /complete work/i });
    await user.click(completeWorkBtn);

    await waitFor(() => {
      // In the modal or updated UI
      expect(screen.getByText(/status: completed/i)).toBeInTheDocument();
    });
  });
});
