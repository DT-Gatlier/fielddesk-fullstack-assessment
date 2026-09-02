import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterAll, afterEach, beforeAll } from 'vitest'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import WorkOrders from './WorkOrders'
import * as AuthContext from '../contexts/AuthContext'

// Generate 25 mock work orders
const mockWorkOrders = Array.from({ length: 25 }, (_, i) => ({
  id: `wo-${i + 1}`,
  title: `Order ${i + 1}`,
  description: `Description ${i + 1}`,
  status: i % 2 === 0 ? 'open' : 'in_progress',
  created_at: '2026-09-02T10:00:00Z',
  technician_id: `tech-1`,
}));

const mockTechnicians = [
  { id: 'tech-1', email: 'tech1@demo.com' }
];

export const handlers = [
  http.get('*/work-orders', () => {
    return HttpResponse.json({ data: mockWorkOrders, total: mockWorkOrders.length })
  }),
  http.get('*/technicians', () => {
    return HttpResponse.json(mockTechnicians)
  }),
  http.post('*/work-orders', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: 'wo-new', ...body })
  }),
]

const server = setupServer(...handlers)

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn(),
    disconnect: vi.fn(),
  })
}))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

describe('WorkOrders Component', () => {
  beforeAll(() => server.listen())
  afterEach(() => {
    server.resetHandlers()
    vi.clearAllMocks()
    queryClient.clear()
  })
  afterAll(() => server.close())

  beforeEach(() => {
    // Mock user auth
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'dispatcher@demo.com', role: 'dispatcher', org_id: 'org-1' },
      token: 'fake-token',
      login: vi.fn(),
      logout: vi.fn(),
    })
  })

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <WorkOrders />
      </QueryClientProvider>
    )
  }

  it('renders table and handles pagination', async () => {
    renderComponent()

    expect(screen.getByText(/Loading work orders.../i)).toBeInTheDocument()
    
    // Default page size is 10 in React Table
    await waitFor(() => {
      expect(screen.getByText('Order 1')).toBeInTheDocument()
    })

    // Should display only 10 items initially (Order 1 to Order 10)
    expect(screen.getByText('Order 10')).toBeInTheDocument()
    expect(screen.queryByText('Order 11')).not.toBeInTheDocument()
    
    // Pagination text
    expect(screen.getByText(/Showing 1 to 10 of 25 results/i)).toBeInTheDocument()

    // Next page button
    const nextBtn = screen.getAllByRole('button').find(b => b.querySelector('.lucide-chevron-right'))
    expect(nextBtn).toBeDefined()
    expect(nextBtn).not.toBeDisabled()
    
    await userEvent.click(nextBtn!)

    await waitFor(() => {
      expect(screen.getByText('Order 11')).toBeInTheDocument()
    })
    expect(screen.queryByText('Order 1')).not.toBeInTheDocument()
    expect(screen.getByText(/Showing 11 to 20 of 25 results/i)).toBeInTheDocument()
  })

  it('handles global filtering', async () => {
    renderComponent()
    
    await waitFor(() => {
      expect(screen.getByText('Order 1')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Search orders.../i)
    await userEvent.type(searchInput, 'Order 15')

    await waitFor(() => {
      expect(screen.getByText('Order 15')).toBeInTheDocument()
    })
    
    // Order 1 shouldn't be there unless '15' matches it (which it doesn't)
    expect(screen.queryByText('Order 1')).not.toBeInTheDocument()
    // 1 item should be shown
    expect(screen.getByText(/Showing 1 to 1 of 1 results/i)).toBeInTheDocument()
  })

  it('handles column filtering by status', async () => {
    renderComponent()
    
    await waitFor(() => {
      expect(screen.getByText('Order 1')).toBeInTheDocument() // Order 1 is 'open' (i=0)
      expect(screen.getByText('Order 2')).toBeInTheDocument() // Order 2 is 'in_progress' (i=1)
    })

    const select = screen.getByRole('combobox')
    await userEvent.selectOptions(select, 'open')

    await waitFor(() => {
      // 25 items total, 13 are open
      expect(screen.getByText(/Showing 1 to 10 of 13 results/i)).toBeInTheDocument()
    })
    
    expect(screen.getByText('Order 1')).toBeInTheDocument() // still open
    expect(screen.queryByText('Order 2')).not.toBeInTheDocument() // in_progress should be hidden
  })
})
