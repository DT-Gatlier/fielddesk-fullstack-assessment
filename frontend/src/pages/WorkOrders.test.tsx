import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WorkOrders from './WorkOrders'
import api from '../api'
import * as AuthContext from '../contexts/AuthContext'

vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  }
}))

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
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
    
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

  it('renders work orders list and handles creation flow', async () => {
    // Mock API responses
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url.includes('/work-orders')) {
        return {
          data: {
            data: [
              {
                id: 'wo-1',
                title: 'Test Order 1',
                description: 'Description 1',
                status: 'open',
                created_at: '2026-09-02T10:00:00Z',
              }
            ],
            total: 1
          }
        }
      }
      if (url.includes('/technicians')) {
        return { data: [{ id: 'tech-1', email: 'tech1@demo.com' }] }
      }
      return { data: [] }
    })

    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'wo-2', title: 'New Order' } })

    renderComponent()

    // 1. Verify fetching and rendering of existing orders
    expect(screen.getByText(/Loading orders.../i)).toBeInTheDocument()
    
    await waitFor(() => {
      expect(screen.getByText('Test Order 1')).toBeInTheDocument()
    })

    // 2. Open Create Modal
    // The button has a plus icon, we can query it or add an aria-label. 
    // The Create button in WorkOrders.tsx doesn't have text inside the button tag itself for the icon version? 
    // Wait, WorkOrders.tsx has a button with className="h-8 w-8 rounded-full" and <Plus> inside. It doesn't have an aria-label or title.
    // Let me fix that in the test or find it by role. Let's find all buttons and click the one that opens the modal.
    // Actually, I should update WorkOrders.tsx to have an aria-label="Create Work Order" for the plus button, but for now I can find it via testing-library
    
    // In WorkOrders.tsx: <Button size="icon" onClick={() => setCreateModalOpen(true)} className="..."> <Plus className="h-4 w-4" /> </Button>
    // I can query by role 'button' and filter.
    const createBtn = screen.getAllByRole('button').find(b => b.className.includes('rounded-full'))
    expect(createBtn).toBeDefined()
    
    await userEvent.click(createBtn!)

    // 3. Fill out Create form
    await waitFor(() => {
      expect(screen.getByText('Create Work Order')).toBeInTheDocument()
    })

    // Label for title is "Title"
    const titleInput = screen.getByLabelText(/Title/i)
    const descInput = screen.getByLabelText(/Description/i)
    
    await userEvent.type(titleInput, 'Emergency Fix')
    await userEvent.type(descInput, 'Pipe burst in sector 7')

    // Submit form
    await userEvent.click(screen.getByRole('button', { name: /Create Order/i }))

    // 4. Verify API call
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/work-orders', {
        title: 'Emergency Fix',
        description: 'Pipe burst in sector 7',
        status: 'open'
      })
    })
  })
})
