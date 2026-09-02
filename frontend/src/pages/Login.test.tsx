import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import Login from './Login'
import api from '../api'
import { AuthProvider } from '../contexts/AuthContext'

vi.mock('../api', () => ({
  default: {
    post: vi.fn()
  }
}))

// Mock navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

describe('Login Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  const renderLogin = () => {
    return render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    )
  }

  it('renders login form correctly', () => {
    renderLogin()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })

  it('shows error on failed login', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      response: { data: { detail: 'Incorrect email or password' } }
    })

    renderLogin()
    
    await userEvent.type(screen.getByLabelText(/email/i), 'test@test.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(screen.getByText('Incorrect email or password')).toBeInTheDocument()
    })
  })

  it('calls login and navigates on success', async () => {
    // Valid 3-part JWT structure so jwtDecode doesn't throw
    const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.signature'
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { access_token: fakeJwt }
    })

    renderLogin()
    
    await userEvent.type(screen.getByLabelText(/email/i), 'owner@demo.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/login', {
        email: 'owner@demo.com',
        password: 'password123'
      })
      expect(localStorage.getItem('token')).toBe(fakeJwt)
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })
})
