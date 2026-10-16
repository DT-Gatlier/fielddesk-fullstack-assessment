import argon2 from 'argon2';
import type pg from 'pg';
import { config } from '../../../shared/config';

/**
 * Demo data: two independent organisations, each with an owner, a dispatcher
 * and technicians, plus a handful of work orders. Used by `npm run db:seed`
 * and by the integration tests.
 */

export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Password123!';

interface SeedUser {
  key: string;
  email: string;
  name: string;
  role: 'owner' | 'dispatcher' | 'technician';
}

const ORGS: { key: string; name: string; slug: string; users: SeedUser[] }[] = [
  {
    key: 'acme',
    name: 'Acme Facilities',
    slug: 'acme',
    users: [
      { key: 'owner', email: 'owner@acme.test', name: 'Olivia Owner', role: 'owner' },
      { key: 'dispatcher', email: 'dispatcher@acme.test', name: 'Dan Dispatcher', role: 'dispatcher' },
      { key: 'tech1', email: 'tech1@acme.test', name: 'Tom Technician', role: 'technician' },
      { key: 'tech2', email: 'tech2@acme.test', name: 'Tara Technician', role: 'technician' },
      // Mock-provider demo recipients: "+tempfail" fails twice then succeeds,
      // "+permfail" is rejected permanently. See README > Background worker.
      { key: 'techFlaky', email: 'fred+tempfail@acme.test', name: 'Fred Flaky-Inbox', role: 'technician' },
      { key: 'techInvalid', email: 'ivan+permfail@acme.test', name: 'Ivan Invalid-Inbox', role: 'technician' },
    ],
  },
  {
    key: 'brightline',
    name: 'Brightline Maintenance',
    slug: 'brightline',
    users: [
      { key: 'owner', email: 'owner@brightline.test', name: 'Bea Owner', role: 'owner' },
      { key: 'dispatcher', email: 'dispatcher@brightline.test', name: 'Ben Dispatcher', role: 'dispatcher' },
      { key: 'tech1', email: 'tech1@brightline.test', name: 'Bob Technician', role: 'technician' },
      { key: 'tech2', email: 'tech2@brightline.test', name: 'Bella Technician', role: 'technician' },
    ],
  },
];

export interface SeededOrg {
  id: string;
  name: string;
  users: Record<string, { id: string; email: string; role: string }>;
  workOrders: { id: string; reference: string; technicianId: string | null }[];
}
export type SeedResult = Record<string, SeededOrg>;

let cachedHash: string | undefined;

const hours = (h: number) => new Date(Date.now() + h * 3600_000);
function dayAt(dayOffset: number, hour: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

export async function seedDatabase(pool: pg.Pool): Promise<SeedResult> {
  cachedHash ??= await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });
  const client = await pool.connect();
  const result: SeedResult = {};
  try {
    await client.query('BEGIN');
    for (const org of ORGS) {
      const existing = await client.query('SELECT id FROM organisations WHERE slug = $1', [org.slug]);
      if (existing.rowCount) throw new Error(`Organisation "${org.slug}" already exists; run db:reset to reseed`);

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO organisations (name, slug, storage_limit_bytes) VALUES ($1, $2, $3) RETURNING id`,
        [org.name, org.slug, config.DEFAULT_ORG_STORAGE_LIMIT_BYTES],
      );
      const orgId = rows[0]!.id;
      const seeded: SeededOrg = { id: orgId, name: org.name, users: {}, workOrders: [] };

      for (const u of org.users) {
        const r = await client.query<{ id: string }>(
          `INSERT INTO users (org_id, email, name, role, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [orgId, u.email, u.name, u.role, cachedHash],
        );
        seeded.users[u.key] = { id: r.rows[0]!.id, email: u.email, role: u.role };
      }

      const dispatcherId = seeded.users.dispatcher!.id;
      const t1 = seeded.users.tech1!.id;
      const t2 = seeded.users.tech2!.id;
      const prefix = org.key === 'acme' ? 'Acme' : 'Brightline';
      const workOrders: {
        title: string; site: string; priority: string; status: string;
        tech: string | null; start: Date | null; end: Date | null; description: string;
      }[] = [
        { title: `${prefix}: Replace HVAC filter`, site: 'North Tower', priority: 'medium', status: 'open', tech: t1, start: dayAt(1, 9), end: dayAt(1, 11), description: 'Quarterly filter replacement on floors 3-5.' },
        { title: `${prefix}: Fix leaking pipe`, site: 'Riverside Mall', priority: 'urgent', status: 'in_progress', tech: t2, start: hours(-1), end: hours(2), description: 'Water leak reported near the food court.' },
        { title: `${prefix}: Elevator inspection`, site: 'North Tower', priority: 'high', status: 'open', tech: t1, start: dayAt(2, 13), end: dayAt(2, 16), description: 'Annual safety inspection.' },
        { title: `${prefix}: Repaint lobby`, site: 'Harbour Offices', priority: 'low', status: 'open', tech: null, start: null, end: null, description: 'Touch up scuffed walls in the main lobby.' },
        { title: `${prefix}: Generator service`, site: 'Data Centre 1', priority: 'high', status: 'completed', tech: t2, start: dayAt(-2, 8), end: dayAt(-2, 12), description: 'Oil change and load test.' },
        { title: `${prefix}: Replace door lock`, site: 'Harbour Offices', priority: 'medium', status: 'on_hold', tech: t1, start: dayAt(3, 10), end: dayAt(3, 11), description: 'Waiting for replacement part.' },
      ];

      for (const [i, w] of workOrders.entries()) {
        const reference = `WO-${String(i + 1).padStart(5, '0')}`;
        const r = await client.query<{ id: string }>(
          `INSERT INTO work_orders (org_id, reference, title, description, priority, status, site_name,
             technician_id, scheduled_start, scheduled_end, assignment_version, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [orgId, reference, w.title, w.description, w.priority, w.status, w.site, w.tech, w.start, w.end, w.tech ? 1 : 0, dispatcherId],
        );
        const id = r.rows[0]!.id;
        seeded.workOrders.push({ id, reference, technicianId: w.tech });
        await client.query(
          `INSERT INTO audit_log (org_id, actor_type, actor_id, action, target_type, target_id, work_order_id, after, metadata)
           VALUES ($1,'user',$2,'work_order.created','work_order',$3,$3,$4,'{"source":"seed"}')`,
          [orgId, dispatcherId, id, JSON.stringify({ reference, title: w.title, status: w.status, technicianId: w.tech })],
        );
      }
      await client.query('UPDATE organisations SET work_order_seq = $2 WHERE id = $1', [orgId, workOrders.length]);
      result[org.key] = seeded;
    }
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
