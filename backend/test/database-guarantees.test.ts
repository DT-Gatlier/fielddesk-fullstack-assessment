import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, withOrg, type Pool } from '../src/db/pool.js';
import { createOrg, createOwnerPool, type TestOrg } from './helpers.js';

// These tests talk to Postgres directly as the runtime role, to show that the guarantees hold even
// if an application query forgot its org_id filter.

let appPool: Pool;
let ownerPool: Pool;
let orgA: TestOrg;
let orgB: TestOrg;

async function insertWorkOrder(
  org: TestOrg,
  values: { technicianId?: string | null; start?: string | null; end?: string | null; status?: string } = {},
): Promise<string> {
  const { rows } = await ownerPool.query<{ id: string }>(
    `INSERT INTO work_orders (org_id, reference, title, site_name, created_by, assigned_technician_id, scheduled_start, scheduled_end, status)
     VALUES ($1, 'WO-' || substr(gen_random_uuid()::text, 1, 8), 'Test job', 'Test site', $2, $3, $4, $5, $6)
     RETURNING id`,
    [org.id, org.dispatcher.id, values.technicianId ?? null, values.start ?? null, values.end ?? null, values.status ?? 'open'],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  appPool = createPool(process.env.DATABASE_URL!, 5);
  ownerPool = createOwnerPool();
  orgA = await createOrg(ownerPool);
  orgB = await createOrg(ownerPool);
  await insertWorkOrder(orgA);
  await insertWorkOrder(orgB);
});

afterAll(async () => {
  await appPool.end();
  await ownerPool.end();
});

describe('row-level security', () => {
  it('returns no rows when no organisation is set', async () => {
    const { rows } = await appPool.query('SELECT id FROM work_orders');
    expect(rows).toHaveLength(0);
  });

  it('only returns rows for the organisation set on the transaction, even without a WHERE clause', async () => {
    const orgIds = await withOrg(appPool, orgA.id, async (client) => {
      const { rows } = await client.query<{ org_id: string }>('SELECT DISTINCT org_id FROM work_orders');
      return rows.map((row) => row.org_id);
    });
    expect(orgIds).toEqual([orgA.id]);
  });

  it('rejects writing a row for another organisation', async () => {
    await expect(
      withOrg(appPool, orgA.id, (client) =>
        client.query(`INSERT INTO audit_log (org_id, actor_type, action, target_type) VALUES ($1, 'system', 'x', 'y')`, [
          orgB.id,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('does not leak the organisation setting to the next transaction on the same connection', async () => {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.org_id', $1, true)", [orgA.id]);
      await client.query('COMMIT');
      const { rows } = await client.query('SELECT id FROM work_orders');
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});

describe('constraints', () => {
  it('rejects assigning a technician from another organisation', async () => {
    await expect(insertWorkOrder(orgA, { technicianId: orgB.technician.id })).rejects.toMatchObject({
      code: '23503',
      constraint: 'work_orders_technician_fk',
    });
  });

  it('rejects overlapping windows for the same technician but allows back-to-back work', async () => {
    const technicianId = orgA.technician.id;
    await insertWorkOrder(orgA, { technicianId, start: '2030-01-01T10:00Z', end: '2030-01-01T11:00Z' });

    await expect(
      insertWorkOrder(orgA, { technicianId, start: '2030-01-01T10:30Z', end: '2030-01-01T11:30Z' }),
    ).rejects.toMatchObject({ code: '23P01', constraint: 'work_orders_no_technician_overlap' });

    await expect(
      insertWorkOrder(orgA, { technicianId, start: '2030-01-01T11:00Z', end: '2030-01-01T12:00Z' }),
    ).resolves.toBeTypeOf('string');
  });

  it('ignores cancelled work orders when checking overlap', async () => {
    const technicianId = orgA.technician.id;
    await insertWorkOrder(orgA, { technicianId, start: '2030-02-01T10:00Z', end: '2030-02-01T11:00Z', status: 'cancelled' });
    await expect(
      insertWorkOrder(orgA, { technicianId, start: '2030-02-01T10:00Z', end: '2030-02-01T11:00Z' }),
    ).resolves.toBeTypeOf('string');
  });

  it('rejects a schedule that ends before it starts', async () => {
    await expect(
      insertWorkOrder(orgA, { start: '2030-03-01T11:00Z', end: '2030-03-01T10:00Z' }),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('append-only audit log', () => {
  it('cannot be updated or deleted by the runtime role', async () => {
    await withOrg(appPool, orgA.id, (client) =>
      client.query(`INSERT INTO audit_log (org_id, actor_type, action, target_type) VALUES ($1, 'system', 'test', 'test')`, [
        orgA.id,
      ]),
    );
    await expect(
      withOrg(appPool, orgA.id, (client) => client.query(`UPDATE audit_log SET action = 'tampered'`)),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(withOrg(appPool, orgA.id, (client) => client.query('DELETE FROM audit_log'))).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('cannot be modified even by the table owner', async () => {
    await expect(ownerPool.query(`UPDATE audit_log SET action = 'tampered'`)).rejects.toThrow(/append-only/);
  });
});
