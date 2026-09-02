import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import * as jwtDecodeModule from 'jwt-decode'

vi.mock('jwt-decode', () => ({
  jwtDecode: vi.fn()
}))

const TestComponent = () => {
  const { user, login, logout } = useAuth()
  return (
    <div>
      <div data-testid="user-id">{user ? user.id : 'No User'}</div>
      <div data-testid="user-role">{user ? user.role : 'No Role'}</div>
      <button onClick={() => login('mock-token')}>Login</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('initializes with no user when no token is present', () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )
    expect(screen.getByTestId('user-id')).toHaveTextContent('No User')
  })

  it('decodes token and sets user on login', () => {
    // Mock the decode return value
    vi.mocked(jwtDecodeModule.jwtDecode).mockReturnValue({
      sub: 'user-123',
      role: 'dispatcher',
      org_id: 'org-456'
    })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    act(() => {
      screen.getByText('Login').click()
    })

    expect(localStorage.getItem('token')).toBe('mock-token')
    expect(screen.getByTestId('user-id')).toHaveTextContent('user-123')
    expect(screen.getByTestId('user-role')).toHaveTextContent('dispatcher')
  })

  it('clears token on logout', () => {
    localStorage.setItem('token', 'existing-token')
    vi.mocked(jwtDecodeModule.jwtDecode).mockReturnValue({ sub: 'user-123' })
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )
    
    act(() => {
      screen.getByText('Logout').click()
    })

    expect(localStorage.getItem('token')).toBeNull()
    expect(screen.getByTestId('user-id')).toHaveTextContent('No User')
  })
})
