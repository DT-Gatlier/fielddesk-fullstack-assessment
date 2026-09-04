import { render, screen, waitFor, act } from '@testing-library/react'
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
    return HttpResponse.json({ id: 'wo-new', ...(body as any) })
  }),
]

const server = setupServer(...handlers)

// TRADEOFF: We mock socket.io-client via Vitest instead of using MSW's experimental `ws` API 
// because socket.io has custom transport mechanisms that are hard to intercept with MSW currently.
export const mockSocketOn = vi.fn()

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: mockSocketOn,
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
  beforeAll(() => {
    server.listen()
    localStorage.setItem('token', 'fake-token')
  })
  afterEach(() => {
    server.resetHandlers()
    vi.clearAllMocks()
    queryClient.clear()
    mockSocketOn.mockClear()
  })
  afterAll(() => {
    server.close()
    localStorage.removeItem('token')
  })

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
  it('shows 409 conflict error in side panel during assignment', async () => {
    server.use(
      http.post('*/work-orders/:id/assign', () => {
        return HttpResponse.json({ error: 'Technician is already booked for this time slot.' }, { status: 409 })
      })
    )

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Order 1')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText('Order 1'))

    expect(screen.getByText('ID: wo-1')).toBeInTheDocument()

    const techSelect = screen.getByLabelText(/Technician/i, { selector: 'select' })
    await userEvent.selectOptions(techSelect, 'tech-1')

    // Using placeholder or label, but since it's an input we might need a specific label
    const startDateInput = screen.getByLabelText(/Start Date\/Time/i)
    await userEvent.type(startDateInput, '2026-09-04T10:00')

    const endDateInput = screen.getByLabelText(/End Date\/Time/i)
    await userEvent.type(endDateInput, '2026-09-04T12:00')

    const assignBtn = screen.getByRole('button', { name: /Save Assignment/i })
    await userEvent.click(assignBtn)

    await waitFor(() => {
      expect(screen.getByText(/Technician is already booked for this time slot/i)).toBeInTheDocument()
    })

    // The side panel should still be open
    expect(screen.getByText('ID: wo-1')).toBeInTheDocument()
  })

  it('assigns work order and updates location, shows toast and closes panel', async () => {
    let patchCalled = false
    server.use(
      http.post('*/work-orders/:id/assign', () => {
        return HttpResponse.json({ id: 'wo-1', status: 'assigned' })
      }),
      http.patch('*/work-orders/:id', async ({ request }) => {
        patchCalled = true
        return HttpResponse.json({ id: 'wo-1' })
      })
    )

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Order 1')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText('Order 1'))
    expect(screen.getByText('ID: wo-1')).toBeInTheDocument()

    const locationInput = screen.getByLabelText(/Location/i)
    await userEvent.clear(locationInput)
    await userEvent.type(locationInput, '123 Main St')

    const techSelect = screen.getByLabelText(/Technician/i, { selector: 'select' })
    await userEvent.selectOptions(techSelect, 'tech-1')

    const startDateInput = screen.getByLabelText(/Start Date\/Time/i)
    await userEvent.type(startDateInput, '2026-09-04T10:00')

    const endDateInput = screen.getByLabelText(/End Date\/Time/i)
    await userEvent.type(endDateInput, '2026-09-04T12:00')

    const assignBtn = screen.getByRole('button', { name: /Save Assignment/i })
    await userEvent.click(assignBtn)

    await waitFor(() => {
      expect(screen.queryByText('ID: wo-1')).not.toBeInTheDocument()
    })

    expect(patchCalled).toBe(true)
  })

  it('updates table instantly on websocket event and briefly highlights row', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Order 1')).toBeInTheDocument()
    })

    // Check initial status
    const row = screen.getByTestId('row-wo-1')
    expect(row).not.toHaveClass('bg-yellow-100/50')
    
    // Check initial status badge
    // Order 1 is open
    expect(row.textContent).toContain('open')

    const updatedOrder = {
      ...mockWorkOrders[0], // wo-1
      status: 'assigned',
    }

    act(() => {
      // Find the LATEST callback registered for 'work_order_updated'
      const call = [...mockSocketOn.mock.calls].reverse().find(call => call[0] === 'work_order_updated')
      console.log('Found socket callback?', !!call, mockSocketOn.mock.calls.length)
      if (call) {
        call[1](updatedOrder)
      }
    })

    await waitFor(() => {
      expect(screen.getByTestId('row-wo-1').textContent).toContain('assigned')
    })
    
    // Check it flashes yellow
    expect(screen.getByTestId('row-wo-1')).toHaveClass('bg-yellow-100/50')

    // TRADEOFF: We are using a real 2.1-second sleep instead of vi.useFakeTimers().
    // Fake timers cause React Testing Library's waitFor() to hang indefinitely because it relies 
    // on setTimeout for its internal polling loops. While this slows down the test suite by ~2s, 
    // it ensures reliable test execution without complex timer mocking workarounds.
    await new Promise(resolve => setTimeout(resolve, 2100))

    await waitFor(() => {
      expect(screen.getByTestId('row-wo-1')).not.toHaveClass('bg-yellow-100/50')
    })
  })
})
