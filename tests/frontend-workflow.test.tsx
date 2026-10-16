// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SeedResult } from '../backend/src/db/seed-data';
import { App, createQueryClient } from '../frontend/src/App';
import { createTestApp, pool, resetData, type TestContext } from './helpers';

/**
 * Full-stack frontend workflow: the real React application (rendered in
 * jsdom) talks to a real API server on a real port, backed by the real test
 * database. Nothing is mocked except the browser's cookie jar, which Node's
 * fetch does not provide.
 *
 * Workflow: sign in -> see validation errors -> create and schedule a work
 * order for a technician -> try to double-book that technician on another
 * work order and see the conflict explained -> nothing was saved.
 */
let ctx: TestContext;
let server: Server;
let seed: SeedResult;
const realFetch = globalThis.fetch;
let cookie = '';

beforeAll(async () => {
  ctx = await createTestApp();
  server = ctx.app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' && input.startsWith('/') ? base + input : input;
    const headers = new Headers(init.headers);
    if (cookie) headers.set('cookie', cookie);
    const res = await realFetch(url, { ...init, headers });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const pair = c.split(';')[0]!;
      cookie = /=$/.test(pair) || /Expires=Thu, 01 Jan 1970/i.test(c) ? '' : pair;
    }
    return res;
  }) as typeof fetch;
});
beforeEach(async () => {
  seed = await resetData(ctx.redis);
  cookie = '';
});
afterEach(() => cleanup());
afterAll(async () => {
  globalThis.fetch = realFetch;
  server.close();
  await ctx.close();
});

function renderApp(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App queryClient={createQueryClient()} />
    </MemoryRouter>,
  );
}

async function signIn(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), 'Password123!');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('dispatcher scheduling workflow (real API + database)', () => {
  it('rejects bad credentials with a clear message', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.type(await screen.findByLabelText('Email'), 'dispatcher@acme.test');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not recognised');
  });

  it('signs in, creates a scheduled work order, and is told about a double-booking', async () => {
    const user = userEvent.setup();
    renderApp();
    await signIn(user, 'dispatcher@acme.test');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    // Dashboard counts come from the API.
    const counts = await screen.findByLabelText('Work order counts');
    await waitFor(() => expect(within(counts).getByText('Open').nextSibling).toHaveTextContent('3'));

    // Create: submit empty first to see validation states.
    await user.click(screen.getAllByRole('link', { name: 'New work order' })[0]!);
    await user.click(await screen.findByRole('button', { name: 'Create work order' }));
    expect(await screen.findByText('Enter a title')).toBeInTheDocument();
    expect(screen.getByText('Enter the site name')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Title'), 'Replace rooftop fan');
    await user.type(screen.getByLabelText('Site'), 'Depot 4');
    await user.selectOptions(screen.getByLabelText('Priority'), 'high');
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2030-03-01T09:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2030-03-01T11:00' } });
    const techSelect = screen.getByLabelText('Technician');
    await waitFor(() => expect(within(techSelect).getByRole('option', { name: 'Tom Technician' })).toBeInTheDocument());
    await user.selectOptions(techSelect, 'Tom Technician');
    await user.click(screen.getByRole('button', { name: 'Create work order' }));

    // Lands on the new work order's page, populated from the API.
    expect(await screen.findByRole('heading', { name: 'Replace rooftop fan' })).toBeInTheDocument();
    expect(screen.getByText('WO-00007')).toBeInTheDocument();
    expect(await screen.findByText(/created the work order/)).toBeInTheDocument();
    const created = await pool.query("SELECT technician_id, priority FROM work_orders WHERE reference = 'WO-00007' AND org_id = $1", [seed.acme!.id]);
    expect(created.rows[0]).toEqual({ technician_id: seed.acme!.users.tech1!.id, priority: 'high' });

    // Try to double-book Tom on the unassigned "Repaint lobby" work order.
    await user.click(screen.getByRole('link', { name: 'Back to work orders' }));
    await user.click(await screen.findByRole('link', { name: 'Acme: Repaint lobby' }));
    expect(await screen.findByRole('heading', { name: 'Acme: Repaint lobby' })).toBeInTheDocument();
    const panel = screen.getByRole('heading', { name: 'Assignment and schedule' }).closest('section')!;
    const tech = within(panel).getByLabelText('Technician');
    await waitFor(() => expect(within(tech).getByRole('option', { name: 'Tom Technician' })).toBeInTheDocument());
    await user.selectOptions(tech, 'Tom Technician');
    fireEvent.change(within(panel).getByLabelText('Start'), { target: { value: '2030-03-01T10:00' } });
    fireEvent.change(within(panel).getByLabelText('End'), { target: { value: '2030-03-01T12:00' } });
    await user.click(within(panel).getByRole('button', { name: 'Save assignment' }));

    const alert = await within(panel).findByRole('alert');
    expect(alert).toHaveTextContent('Conflict');
    expect(alert).toHaveTextContent('overlapping assignment');
    expect(alert).toHaveTextContent('Already booked on WO-00007');

    const lobby = await pool.query("SELECT technician_id FROM work_orders WHERE title = 'Acme: Repaint lobby'");
    expect(lobby.rows[0].technician_id).toBeNull();

    // A non-overlapping slot succeeds.
    fireEvent.change(within(panel).getByLabelText('Start'), { target: { value: '2030-03-01T11:00' } });
    fireEvent.change(within(panel).getByLabelText('End'), { target: { value: '2030-03-01T12:00' } });
    await user.click(within(panel).getByRole('button', { name: 'Save assignment' }));
    expect(await within(panel).findByText('Assignment saved.')).toBeInTheDocument();
  });

  it('technicians see only their own jobs and no dispatcher controls', async () => {
    const user = userEvent.setup();
    renderApp();
    await signIn(user, 'tech2@acme.test');
    expect(await screen.findByRole('heading', { name: 'My work' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Work orders' }));
    expect(await screen.findByRole('link', { name: 'Acme: Fix leaking pipe' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Acme: Replace HVAC filter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New work order' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Export CSV' })).not.toBeInTheDocument();
  });
});
