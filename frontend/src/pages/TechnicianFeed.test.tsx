import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, afterAll, afterEach, beforeAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TechnicianFeed from './TechnicianFeed';
import '@testing-library/jest-dom';

const mockWorkOrders = {
  data: [
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
  ]
};

const handlers = [
  http.get('*/work-orders', () => {
    return HttpResponse.json(mockWorkOrders);
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

    // Check locations
    expect(screen.getByText('Building A')).toBeInTheDocument();
    expect(screen.getByText('Building B')).toBeInTheDocument();

    // Check status badges
    expect(screen.getByText(/assigned/i)).toBeInTheDocument();
    expect(screen.getByText(/in progress/i)).toBeInTheDocument();

    // Check priorities
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
  });

  it('renders empty state when no work orders', async () => {
    server.use(
      http.get('*/work-orders', () => {
        return HttpResponse.json({ data: [] });
      })
    );

    render(
      <QueryClientProvider client={queryClient}>
        <TechnicianFeed />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/no work orders assigned/i)).toBeInTheDocument();
    });
  });

  it('renders error state on API failure', async () => {
    server.use(
      http.get('*/work-orders', () => {
        return new HttpResponse(null, { status: 500 });
      })
    );

    render(
      <QueryClientProvider client={queryClient}>
        <TechnicianFeed />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to load work orders/i)).toBeInTheDocument();
    });
  });
});
