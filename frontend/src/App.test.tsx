import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthProvider } from './auth';

const USER = {
  id: 'u1',
  name: 'Dan Dispatcher',
  email: 'dispatcher@northwind.test',
  role: 'dispatcher',
  organisation: { id: 'o1', name: 'Northwind Facilities' },
};

/** Fake API with a real notion of "signed in", driven by login and logout calls. */
function fakeApi() {
  let signedIn = false;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (url === '/api/auth/me') {
        return signedIn ? json(200, { user: USER }) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } });
      }
      if (url === '/api/auth/login' && method === 'POST') {
        const { password } = JSON.parse(String(init.body));
        if (password !== 'right') return json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
        signedIn = true;
        return json(200, { user: USER });
      }
      if (url === '/api/auth/logout') {
        signedIn = false;
        return new Response(null, { status: 204 });
      }
      if (url === '/api/dashboard/summary') {
        return json(200, {
          data: { byStatus: { open: 1, scheduled: 0, in_progress: 0, on_hold: 0, completed: 0, cancelled: 0 }, total: 1, unassigned: 1, overdue: 0, today: 0, urgent: 0 },
        });
      }
      if (url.startsWith('/api/work-orders')) {
        return json(200, { data: [], pagination: { page: 1, pageSize: 6, total: 0, totalPages: 1 } });
      }
      return json(404, { error: { code: 'NOT_FOUND', message: 'not found' } });
    }),
  );
  // Real-time is not under test here; a socket that never connects keeps the app in polling mode.
  vi.stubGlobal(
    'WebSocket',
    class {
      onmessage = null;
      onclose = null;
      close() {}
    },
  );
}

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('session lifecycle', () => {
  it('shows the login screen without a session, signs in, and signs out again', async () => {
    const user = userEvent.setup();
    fakeApi();
    renderApp();

    // Regression: a 401 from /api/auth/me must lead to the login form, not an endless loading screen.
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), USER.email);
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'right');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText(/Dan Dispatcher/)).toBeInTheDocument();
    expect(await screen.findByText('No work orders yet.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
