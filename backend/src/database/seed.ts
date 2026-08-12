import argon2 from 'argon2';
import { loadConfig } from '../config.js';
import { createPool, inTransaction } from './pool.js';
import type { Role } from '../modules/auth/auth.types.js';

const config = loadConfig();
const database = createPool(config);
const passwordHash = await argon2.hash('FieldDesk123!');
const organisations = [
  { id: '10000000-0000-4000-8000-000000000001', name: 'Northwind Maintenance', slug: 'northwind' },
  { id: '20000000-0000-4000-8000-000000000001', name: 'Contoso Field Services', slug: 'contoso' }
];
const roleIds: Record<string, string> = { owner: '00000000-0000-4000-8000-000000000001', dispatcher: '00000000-0000-4000-8000-000000000002', technician: '00000000-0000-4000-8000-000000000003' };

try {
  await inTransaction(database, async (client) => {
    for (const [orgIndex, organisation] of organisations.entries()) {
      await client.query(`INSERT INTO organisations (id, name, slug, storage_limit_bytes) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`, [organisation.id, organisation.name, organisation.slug, config.DEFAULT_ORG_STORAGE_LIMIT_BYTES]);
      for (const role of ['owner', 'dispatcher', 'technician'] as Role[]) {
        const userId = `${orgIndex + 1}${roleIds[role]!.slice(1)}`;
        await client.query(`INSERT INTO users (id, organisation_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (organisation_id, email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, is_active = true`, [userId, organisation.id, `${organisation.name} ${role}`, `${role}@${organisation.slug}.test`, passwordHash, role]);
      }
      const ownerId = `${orgIndex + 1}${roleIds.owner!.slice(1)}`;
      const technicianId = `${orgIndex + 1}${roleIds.technician!.slice(1)}`;
      const departmentId = `${orgIndex + 3}0000000-0000-4000-8000-000000000001`;
      const employeeId = `${orgIndex + 5}0000000-0000-4000-8000-000000000001`;
      const workOrderId = `${orgIndex + 7}0000000-0000-4000-8000-000000000001`;
      await client.query(`INSERT INTO departments (id, organisation_id, name, code) VALUES ($1, $2, 'Field Operations', 'FIELD') ON CONFLICT (id) DO NOTHING`, [departmentId, organisation.id]);
      await client.query(`INSERT INTO employees (id, organisation_id, department_id, name, email) VALUES ($1, $2, $3, 'Sample Field Employee', $4) ON CONFLICT (id) DO NOTHING`, [employeeId, organisation.id, departmentId, `employee@${organisation.slug}.test`]);
      await client.query(`INSERT INTO work_orders (id, organisation_id, reference_number, title, description, priority, status, assigned_technician_id, scheduled_start, scheduled_end, site_name, created_by_id) VALUES ($1, $2, $3, 'Quarterly equipment inspection', 'Seeded work order for frontend development', 'medium', 'scheduled', $4, date_trunc('day', now()) + interval '1 day 9 hours', date_trunc('day', now()) + interval '1 day 11 hours', 'Central Plant', $5) ON CONFLICT (id) DO NOTHING`, [workOrderId, organisation.id, `${organisation.slug.toUpperCase()}-1001`, technicianId, ownerId]);
    }
  });
  console.info('Seeded two organisations and owner, dispatcher, and technician accounts.');
} finally {
  await database.end();
}
