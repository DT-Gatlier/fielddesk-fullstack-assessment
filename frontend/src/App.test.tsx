import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, beforeAll, afterEach, afterAll } from 'vitest'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import App from './App'

const fakeOwnerJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJvd25lci0xMjMiLCJlbWFpbCI6Im93bmVyQGRlbW8uY29tIiwicm9sZSI6Im93bmVyIn0.signature'
const fakeDispatcherJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaXNwYXRjaGVyLTEyMyIsImVtYWlsIjoiZGlzcGF0Y2hlckBkZW1vLmNvbSIsInJvbGUiOiJkaXNwYXRjaGVyIn0.signature'
const fakeTechnicianJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZWNoLTEyMyIsImVtYWlsIjoidGVjaEBkZW1vLmNvbSIsInJvbGUiOiJ0ZWNobmljaWFuIn0.signature'

const handlers = [
  http.post('*/login', async ({ request }) => {
    const { email } = (await request.json()) as any
    if (email.includes('owner')) {
      return HttpResponse.json({ access_token: fakeOwnerJwt })
    }
    if (email.includes('dispatcher')) {
      return HttpResponse.json({ access_token: fakeDispatcherJwt })
    }
    if (email.includes('tech')) {
      return HttpResponse.json({ access_token: fakeTechnicianJwt })
    }
    return new HttpResponse(null, { status: 401 })
  }),
  http.get('*/work-orders', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    if (status === 'open') {
      return HttpResponse.json({ total: 10, data: [] })
    }
    if (status === 'completed') {
      return HttpResponse.json({ total: 25, data: [] })
    }
    return HttpResponse.json({ total: 0, data: [] })
  })
]

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
})
afterAll(() => server.close())

describe('App Routing and Owner Dashboard', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('redirects to /login when unauthenticated', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
    })
  })

  it('intercepts login and routes owner to /owner with summary counts', async () => {
    render(<App />)
    
    // Perform login
    await userEvent.type(screen.getByLabelText(/email/i), 'owner@test.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))
    
    await waitFor(() => {
      expect(screen.getByText('Owner Dashboard')).toBeInTheDocument()
    })
    
    await waitFor(() => {
      expect(screen.getByTestId('count-open')).toHaveTextContent('10')
      expect(screen.getByTestId('count-completed')).toHaveTextContent('25')
    })
  })
  
  it('intercepts login and routes dispatcher to /dispatcher', async () => {
    render(<App />)
    
    await userEvent.type(screen.getByLabelText(/email/i), 'dispatcher@test.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))
    
    await waitFor(() => {
      // Check window location directly since Work Orders is rendered
      expect(window.location.pathname).toBe('/dispatcher')
    })
  })
  
  it('intercepts login and routes technician to /technician', async () => {
    render(<App />)
    
    await userEvent.type(screen.getByLabelText(/email/i), 'tech@test.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))
    
    await waitFor(() => {
      expect(screen.getByText('Technician View')).toBeInTheDocument()
    })
  })
})
