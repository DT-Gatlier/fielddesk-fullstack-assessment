import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { Pool } from '../src/db/pool.js';
import { apiCreateWorkOrder, createOrg, createOwnerPool, createTestApp, futureWindow, login, type TestOrg } from './helpers.js';

interface Connection {
  socket: WebSocket;
  messages: Array<{ type: string; workOrderId?: string }>;
  closeCode?: number;
}

let app: FastifyInstance;
let second: FastifyInstance;
let ownerPool: Pool;
let orgA: TestOrg;
let orgB: TestOrg;

const urlOf = (instance: FastifyInstance) => `ws://127.0.0.1:${(instance.server.address() as AddressInfo).port}/api/realtime`;

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function connect(cookie: string | null, options: { instance?: FastifyInstance; origin?: string } = {}): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { origin: options.origin ?? app.config.WEB_ORIGIN };
    if (cookie) headers.cookie = cookie;
    const socket = new WebSocket(urlOf(options.instance ?? app), { headers });
    const connection: Connection = { socket, messages: [] };
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString());
      connection.messages.push(message);
      if (message.type === 'connected') resolve(connection);
    });
    socket.on('close', (code) => {
      connection.closeCode = code;
    });
    socket.on('unexpected-response', (_request, response) => reject(Object.assign(new Error('rejected'), { statusCode: response.statusCode })));
    socket.on('error', reject);
  });
}

const sawWorkOrder = (connection: Connection, id: string) => connection.messages.some((m) => m.workOrderId === id);

beforeAll(async () => {
  app = await createTestApp({ realtimeHeartbeatMs: 200 });
  second = await createTestApp({ realtimeHeartbeatMs: 200 });
  await app.listen({ port: 0, host: '127.0.0.1' });
  await second.listen({ port: 0, host: '127.0.0.1' });
  ownerPool = createOwnerPool();
  orgA = await createOrg(ownerPool);
  orgB = await createOrg(ownerPool);
});

afterAll(async () => {
  await app.close();
  await second.close();
  await ownerPool.end();
});

describe('connection security', () => {
  it('rejects connections without a valid session', async () => {
    await expect(connect(null)).rejects.toMatchObject({ statusCode: 401 });
    await expect(connect('fd_session=forged')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects connections from a foreign origin', async () => {
    const cookie = await login(app, orgA.dispatcher.email);
    await expect(connect(cookie, { origin: 'https://evil.example' })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('closes the socket once the session is revoked', async () => {
    const cookie = await login(app, orgA.owner.email);
    const connection = await connect(cookie);
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    await waitFor(() => connection.closeCode !== undefined);
    expect(connection.closeCode).toBe(4401);
  });
});

describe('organisation isolation', () => {
  it('delivers events only within the organisation, and only to the assigned technician', async () => {
    const dispatcherA = await login(app, orgA.dispatcher.email);
    const listenerA = await connect(dispatcherA);
    const listenerB = await connect(await login(app, orgB.dispatcher.email));
    const ownerB = await connect(await login(app, orgB.owner.email), { instance: second });
    const assignedTech = await connect(await login(app, orgA.technician.email));

    const workOrder = await apiCreateWorkOrder(app, dispatcherA, { assignedTechnicianId: orgA.technician.id, ...futureWindow() });
    const unassigned = await apiCreateWorkOrder(app, dispatcherA);

    await waitFor(() => sawWorkOrder(listenerA, workOrder.id) && sawWorkOrder(listenerA, unassigned.id));
    await waitFor(() => sawWorkOrder(assignedTech, workOrder.id));
    // Give any misrouted message time to arrive before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(sawWorkOrder(listenerB, workOrder.id)).toBe(false);
    expect(sawWorkOrder(ownerB, workOrder.id)).toBe(false);
    expect(listenerB.messages.filter((m) => m.type !== 'connected')).toHaveLength(0);
    expect(sawWorkOrder(assignedTech, unassigned.id)).toBe(false);

    for (const connection of [listenerA, listenerB, ownerB, assignedTech]) connection.socket.close();
  });

  it('delivers events to clients connected to a different API instance', async () => {
    const dispatcher = await login(app, orgA.dispatcher.email);
    const remote = await connect(dispatcher, { instance: second });
    const workOrder = await apiCreateWorkOrder(app, dispatcher);
    await waitFor(() => sawWorkOrder(remote, workOrder.id));
    remote.socket.close();
  });

  it('accepts reconnection with the same session', async () => {
    const cookie = await login(app, orgA.dispatcher.email);
    const first = await connect(cookie);
    first.socket.terminate();
    const again = await connect(cookie);
    const workOrder = await apiCreateWorkOrder(app, cookie);
    await waitFor(() => sawWorkOrder(again, workOrder.id));
    again.socket.close();
  });
});
