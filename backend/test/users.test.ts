import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from '../src/db/pool.js';
import { createOrg, createOwnerPool, createTestApp, login, type TestOrg } from './helpers.js';

let app: FastifyInstance;
let ownerPool: Pool;
let orgA: TestOrg;
let orgB: TestOrg;

beforeAll(async () => {
  app = await createTestApp();
  ownerPool = createOwnerPool();
  orgA = await createOrg(ownerPool);
  orgB = await createOrg(ownerPool);
});

afterAll(async () => {
  await app.close();
  await ownerPool.end();
});

describe('role restrictions', () => {
  it('lets owners and dispatchers list users, but not technicians', async () => {
    for (const [user, expected] of [
      [orgA.owner, 200],
      [orgA.dispatcher, 200],
      [orgA.technician, 403],
    ] as const) {
      const cookie = await login(app, user.email);
      const response = await app.inject({ method: 'GET', url: '/api/users', headers: { cookie } });
      expect(response.statusCode, user.role).toBe(expected);
    }
  });

  it('only lets owners change roles', async () => {
    const cookie = await login(app, orgA.dispatcher.email);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/users/${orgA.technician.id}`,
      headers: { cookie },
      payload: { role: 'dispatcher' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });

  it('records role changes in the audit log', async () => {
    const org = await createOrg(ownerPool);
    const cookie = await login(app, org.owner.email);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/users/${org.technician.id}`,
      headers: { cookie, 'x-request-id': 'role-change-test' },
      payload: { role: 'dispatcher' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.role).toBe('dispatcher');

    const { rows } = await ownerPool.query(
      `SELECT actor_id, action, target_id, before, after, request_id FROM audit_log WHERE org_id = $1`,
      [org.id],
    );
    expect(rows).toEqual([
      {
        actor_id: org.owner.id,
        action: 'user.role_changed',
        target_id: org.technician.id,
        before: { role: 'technician' },
        after: { role: 'dispatcher' },
        request_id: 'role-change-test',
      },
    ]);
  });

  it('prevents removing the last active owner', async () => {
    const org = await createOrg(ownerPool);
    const cookie = await login(app, org.owner.email);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/users/${org.owner.id}`,
      headers: { cookie },
      payload: { role: 'dispatcher' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('LAST_OWNER');
  });
});

describe('organisation isolation', () => {
  it('lists only users from the caller organisation', async () => {
    const cookie = await login(app, orgA.owner.email);
    const response = await app.inject({ method: 'GET', url: '/api/users', headers: { cookie } });
    const ids = response.json().data.map((user: { id: string }) => user.id);
    expect(ids.sort()).toEqual([orgA.owner.id, orgA.dispatcher.id, orgA.technician.id].sort());
  });

  it('returns 404 when an owner targets a user in another organisation, and changes nothing', async () => {
    const cookie = await login(app, orgA.owner.email);
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/users/${orgB.technician.id}`,
      headers: { cookie },
      payload: { role: 'owner' },
    });
    expect(response.statusCode).toBe(404);

    const { rows } = await ownerPool.query('SELECT role FROM users WHERE id = $1', [orgB.technician.id]);
    expect(rows[0].role).toBe('technician');
  });
});
