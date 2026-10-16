import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SeedResult } from '../backend/src/db/seed-data';
import { createTestApp, loginAs, resetData, waitFor, window, type TestContext } from './helpers';

/**
 * Runs the API on a real port and connects real SSE clients. Two API
 * instances are used: events are published through one and must reach
 * clients connected to the other (multi-instance fan-out through Redis).
 */
let a: TestContext;
let b: TestContext;
let serverA: Server;
let serverB: Server;
let seed: SeedResult;
const open: AbortController[] = [];

beforeAll(async () => {
  a = await createTestApp();
  b = await createTestApp();
  serverA = a.app.listen(0);
  serverB = b.app.listen(0);
});
beforeEach(async () => {
  seed = await resetData(a.redis);
});
afterAll(async () => {
  for (const c of open) c.abort();
  await a.close();
  await b.close();
  serverA.close();
  serverB.close();
});

const base = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;

async function sessionCookie(email: string) {
  const res = await fetch(`${base(serverA)}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!' }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

interface Client { events: { event: string; data: unknown }[]; status: number }
async function connect(server: Server, email: string): Promise<Client> {
  const controller = new AbortController();
  open.push(controller);
  const res = await fetch(`${base(server)}/api/realtime/stream`, {
    headers: { cookie: await sessionCookie(email) }, signal: controller.signal,
  });
  const client: Client = { events: [], status: res.status };
  if (res.status !== 200 || !res.body) return client;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const event = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (event && data) client.events.push({ event, data: JSON.parse(data) });
        }
      }
    } catch { /* aborted */ }
  })();
  await waitFor(async () => client.events.some((e) => e.event === 'ready'));
  return client;
}
const workOrderEvents = (c: Client) => c.events.filter((e) => e.event === 'work_order').map((e) => e.data as { workOrderId: string; type: string });

describe('real-time updates', () => {
  it('rejects unauthenticated stream connections', async () => {
    const res = await fetch(`${base(serverA)}/api/realtime/stream`);
    expect(res.status).toBe(401);
  });

  it('delivers events only to the right organisation, across API instances', async () => {
    const acmeOnB = await connect(serverB, 'owner@acme.test');
    const acmeOnA = await connect(serverA, 'dispatcher@acme.test');
    const brightOnB = await connect(serverB, 'dispatcher@brightline.test');
    const brightOnA = await connect(serverA, 'owner@brightline.test');

    const agent = await loginAs(a.app, 'dispatcher@acme.test');
    const created = await agent.post('/api/work-orders').send({ title: 'Live one', priority: 'low', siteName: 'S' });
    expect(created.status).toBe(201);

    await waitFor(async () => workOrderEvents(acmeOnB).length > 0 && workOrderEvents(acmeOnA).length > 0);
    expect(workOrderEvents(acmeOnB)[0]).toMatchObject({ type: 'work_order.created', workOrderId: created.body.data.id });
    // Give any (incorrect) cross-org delivery time to arrive before asserting absence.
    await new Promise((r) => setTimeout(r, 300));
    expect(workOrderEvents(brightOnB)).toEqual([]);
    expect(workOrderEvents(brightOnA)).toEqual([]);

    // And the reverse direction.
    const bAgent = await loginAs(a.app, 'dispatcher@brightline.test');
    await bAgent.post('/api/work-orders').send({ title: 'Bright live', priority: 'low', siteName: 'S' });
    await waitFor(async () => workOrderEvents(brightOnA).length > 0);
    await new Promise((r) => setTimeout(r, 300));
    expect(workOrderEvents(acmeOnA)).toHaveLength(1);
  });

  it('technicians only receive events about their own assignments', async () => {
    const tech1 = await connect(serverA, 'tech1@acme.test');
    const tech2 = await connect(serverB, 'tech2@acme.test');
    const agent = await loginAs(a.app, 'dispatcher@acme.test');
    const wo = await agent.post('/api/work-orders').send({
      title: 'For tech1', priority: 'low', siteName: 'S', technicianId: seed.acme!.users.tech1!.id, ...window(1, 2),
    });
    await waitFor(async () => workOrderEvents(tech1).length > 0);
    expect(workOrderEvents(tech1)[0]!.workOrderId).toBe(wo.body.data.id);
    await new Promise((r) => setTimeout(r, 300));
    expect(workOrderEvents(tech2)).toEqual([]);
  });

  it('a logged-out session cannot open (or reopen) a stream', async () => {
    const cookie = await sessionCookie('dispatcher@acme.test');
    const res = await fetch(`${base(serverA)}/api/auth/logout`, { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(204);
    const stream = await fetch(`${base(serverA)}/api/realtime/stream`, { headers: { cookie } });
    expect(stream.status).toBe(401);
  });

  it('a client that reconnects (e.g. to another instance) receives subsequent events', async () => {
    const first = await connect(serverA, 'dispatcher@acme.test');
    open.at(-1)!.abort(); // connection drops
    await new Promise((r) => setTimeout(r, 100));
    const second = await connect(serverB, 'dispatcher@acme.test'); // EventSource reconnects
    const agent = await loginAs(a.app, 'owner@acme.test');
    await agent.post('/api/work-orders').send({ title: 'After reconnect', priority: 'low', siteName: 'S' });
    await waitFor(async () => workOrderEvents(second).length > 0);
    expect(workOrderEvents(first)).toEqual([]);
    // The ready event tells the client whether live delivery is healthy.
    expect(second.events[0]).toMatchObject({ event: 'ready', data: { realtime: 'ok' } });
  });
});
