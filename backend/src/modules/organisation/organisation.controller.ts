import type { RequestHandler } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { badRequest } from '../../common/errors.js';
import type { Database } from '../../database/pool.js';
import { inTransaction } from '../../database/pool.js';
import { getIdentity } from '../auth/auth.middleware.js';
import type { RuntimeServices } from '../../infrastructure/runtime.js';

const updateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  timezone: z.string().trim().min(1).max(80).refine((value) => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Invalid IANA timezone').optional(),
  storageLimitBytes: z.number().int().positive().optional(),
  settings: z.record(z.unknown()).optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export function getOrganisation(database: Database): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity);
    const result = await database.query(`SELECT id, name, slug, timezone, settings, storage_used_bytes AS "storageUsedBytes", storage_limit_bytes AS "storageLimitBytes", created_at AS "createdAt", updated_at AS "updatedAt" FROM organisations WHERE id = $1`, [identity.organisationId]);
    response.json({ data: result.rows[0] });
  });
}

export function updateOrganisation(database: Database, runtime: RuntimeServices): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity);
    const input = updateSchema.parse(request.body);
    const mapping: Record<string, string> = { name: 'name', timezone: 'timezone', storageLimitBytes: 'storage_limit_bytes', settings: 'settings' };
    const entries = Object.entries(input);
    const updated = await inTransaction(database, async (client) => {
      const before = await client.query('SELECT name, timezone, settings, storage_limit_bytes AS "storageLimitBytes" FROM organisations WHERE id = $1 FOR UPDATE', [identity.organisationId]);
      if (input.storageLimitBytes !== undefined) {
        const usage = await client.query<{ storage_used_bytes: string }>('SELECT storage_used_bytes FROM organisations WHERE id = $1', [identity.organisationId]);
        if (input.storageLimitBytes < Number(usage.rows[0]?.storage_used_bytes ?? 0)) throw badRequest('Storage limit cannot be lower than current usage');
      }
      const result = await client.query(`UPDATE organisations SET ${entries.map(([key], index) => `${mapping[key]} = $${index + 2}`).join(', ')}, updated_at = now() WHERE id = $1 RETURNING id, name, slug, timezone, settings, storage_used_bytes AS "storageUsedBytes", storage_limit_bytes AS "storageLimitBytes", updated_at AS "updatedAt"`, [identity.organisationId, ...entries.map(([, value]) => value)]);
      await client.query(`INSERT INTO audit_entries (organisation_id, actor_user_id, action, target_type, target_id, before_data, after_data) VALUES ($1, $2, 'organisation.updated', 'organisation', $1, $3, $4)`, [identity.organisationId, identity.userId, before.rows[0], result.rows[0]]);
      return result.rows[0];
    });
    await runtime.publish(identity.organisationId, 'organisation.updated', updated);
    response.json({ data: updated });
  });
}
