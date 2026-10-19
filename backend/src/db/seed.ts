import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { hashPassword } from '../auth/password.js';
import type { Role } from '../auth/sessions.js';

/**
 * Assessment seed data: two organisations, each with every role. Uses fixed ids and
 * ON CONFLICT DO NOTHING, so running it again is harmless. Runs as the table owner (bypasses RLS).
 */

interface SeedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface SeedOrg {
  id: string;
  name: string;
  prefix: string;
  users: SeedUser[];
  sites: string[];
}

export const SEED_ORGS: SeedOrg[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Northwind Facilities',
    prefix: 'northwind',
    sites: ['Harbour View Tower', 'Riverside Mall', 'Northwind HQ', 'Elm Street Clinic'],
    users: [
      { id: '11111111-0000-4000-8000-000000000001', email: 'owner@northwind.test', name: 'Olivia Owner', role: 'owner' },
      { id: '11111111-0000-4000-8000-000000000002', email: 'dispatcher@northwind.test', name: 'Dan Dispatcher', role: 'dispatcher' },
      { id: '11111111-0000-4000-8000-000000000003', email: 'tech1@northwind.test', name: 'Tara Technician', role: 'technician' },
      { id: '11111111-0000-4000-8000-000000000004', email: 'tech2@northwind.test', name: 'Theo Technician', role: 'technician' },
    ],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Harbor Maintenance Co',
    prefix: 'harbor',
    sites: ['Pier 7 Warehouse', 'Lighthouse Hotel', 'Dockside Offices'],
    users: [
      { id: '22222222-0000-4000-8000-000000000001', email: 'owner@harbor.test', name: 'Hannah Owner', role: 'owner' },
      { id: '22222222-0000-4000-8000-000000000002', email: 'dispatcher@harbor.test', name: 'Hugo Dispatcher', role: 'dispatcher' },
      { id: '22222222-0000-4000-8000-000000000003', email: 'tech1@harbor.test', name: 'Hiro Technician', role: 'technician' },
    ],
  },
];

const WORK_TEMPLATES: Array<{ title: string; priority: string; status: string; dayOffset: number | null; hour: number }> = [
  { title: 'Replace HVAC filter', priority: 'medium', status: 'scheduled', dayOffset: 1, hour: 9 },
  { title: 'Inspect fire alarm panel', priority: 'high', status: 'scheduled', dayOffset: 1, hour: 13 },
  { title: 'Fix leaking pipe in basement', priority: 'urgent', status: 'in_progress', dayOffset: 0, hour: 10 },
  { title: 'Repaint stairwell handrails', priority: 'low', status: 'open', dayOffset: null, hour: 0 },
  { title: 'Service backup generator', priority: 'high', status: 'completed', dayOffset: -2, hour: 8 },
  { title: 'Replace lobby light fixtures', priority: 'medium', status: 'open', dayOffset: null, hour: 0 },
];

export async function seed(connectionString: string, password: string, log: (message: string) => void = console.log) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await hashPassword(password);

    for (const org of SEED_ORGS) {
      await client.query('INSERT INTO organisations (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [org.id, org.name]);
      for (const user of org.users) {
        await client.query(
          `INSERT INTO users (id, org_id, email, name, role, password_hash)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
          [user.id, org.id, user.email, user.name, user.role, passwordHash],
        );
      }

      const existing = await client.query('SELECT 1 FROM work_orders WHERE org_id = $1 LIMIT 1', [org.id]);
      if (existing.rowCount) continue;

      const dispatcher = org.users.find((user) => user.role === 'dispatcher')!;
      const technicians = org.users.filter((user) => user.role === 'technician');
      for (const [index, template] of WORK_TEMPLATES.entries()) {
        const reference = `WO-${String(index + 1).padStart(6, '0')}`;
        const scheduled = template.dayOffset !== null;
        // Spread work across technicians; timeslots are distinct so seed data never violates the overlap constraint.
        const technician = scheduled ? technicians[index % technicians.length]! : null;
        await client.query(
          `INSERT INTO work_orders
             (org_id, reference, title, description, priority, status, site_name,
              assigned_technician_id, scheduled_start, scheduled_end, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
             CASE WHEN $9::int IS NULL THEN NULL ELSE date_trunc('day', now()) + make_interval(days => $9::int, hours => $10::int) END,
             CASE WHEN $9::int IS NULL THEN NULL ELSE date_trunc('day', now()) + make_interval(days => $9::int, hours => $10::int + 2) END,
             $11)`,
          [
            org.id,
            reference,
            template.title,
            `${template.title} at ${org.sites[index % org.sites.length]}.`,
            template.priority,
            template.status,
            org.sites[index % org.sites.length],
            technician?.id ?? null,
            template.dayOffset,
            template.hour,
            dispatcher.id,
          ],
        );
      }
      await client.query('UPDATE organisations SET work_order_seq = $2 WHERE id = $1', [org.id, WORK_TEMPLATES.length]);
      log(`seeded ${org.name}`);
    }

    await client.query('COMMIT');
    log('seed complete');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await import('../config.js');
  const url = process.env.MIGRATION_DATABASE_URL;
  const password = process.env.SEED_PASSWORD;
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed sample accounts with NODE_ENV=production');
    process.exit(1);
  }
  if (!url || !password) {
    console.error('MIGRATION_DATABASE_URL and SEED_PASSWORD must be set');
    process.exit(1);
  }
  try {
    await seed(url, password);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
