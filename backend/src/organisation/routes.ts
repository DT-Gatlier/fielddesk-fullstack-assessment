import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recordAudit, userActor } from '../audit/audit.js';
import { authenticate, authOf, requireRole } from '../auth/guards.js';
import { withOrg } from '../db/pool.js';
import { AppError } from '../http/errors.js';
import { parse } from '../http/validation.js';
import { MOCK_MODE_KEY, MOCK_PROVIDER_MODES, MockProvider } from '../notifications/provider.js';

const MAX_STORAGE_LIMIT = 50 * 1024 ** 3;

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    storageLimitBytes: z.number().int().min(0).max(MAX_STORAGE_LIMIT).optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.storageLimitBytes !== undefined, {
    message: 'Provide at least one of name or storageLimitBytes.',
  });

interface OrganisationRow {
  id: string;
  name: string;
  storage_limit_bytes: number;
  storage_used_bytes: number;
}

const toOrganisation = (row: OrganisationRow) => ({
  id: row.id,
  name: row.name,
  storageLimitBytes: row.storage_limit_bytes,
  storageUsedBytes: row.storage_used_bytes,
});

export async function organisationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/organisation', { preHandler: authenticate }, async (request) => {
    const auth = authOf(request);
    const row = await withOrg(app.pg, auth.orgId, async (client) => {
      const { rows } = await client.query<OrganisationRow>(
        'SELECT id, name, storage_limit_bytes, storage_used_bytes FROM organisations WHERE id = $1',
        [auth.orgId],
      );
      return rows[0]!;
    });
    return { data: toOrganisation(row) };
  });

  // Organisation settings are owner-only.
  app.patch('/api/organisation', { preHandler: requireRole('owner') }, async (request) => {
    const auth = authOf(request);
    const changes = parse(updateSchema, request.body);
    const row = await withOrg(app.pg, auth.orgId, async (client) => {
      const before = (
        await client.query<OrganisationRow>(
          'SELECT id, name, storage_limit_bytes, storage_used_bytes FROM organisations WHERE id = $1 FOR UPDATE',
          [auth.orgId],
        )
      ).rows[0]!;
      const { rows } = await client.query<OrganisationRow>(
        `UPDATE organisations SET name = $2, storage_limit_bytes = $3 WHERE id = $1
         RETURNING id, name, storage_limit_bytes, storage_used_bytes`,
        [auth.orgId, changes.name ?? before.name, changes.storageLimitBytes ?? before.storage_limit_bytes],
      );
      const after = rows[0]!;
      await recordAudit(client, {
        orgId: auth.orgId,
        actor: userActor(auth),
        action: 'organisation.updated',
        targetType: 'organisation',
        targetId: auth.orgId,
        before: { name: before.name, storageLimitBytes: before.storage_limit_bytes },
        after: { name: after.name, storageLimitBytes: after.storage_limit_bytes },
        requestId: request.id,
      });
      return after;
    });
    return { data: toOrganisation(row) };
  });

  // Demo control for the mock notification provider. Not registered in production.
  if (app.config.NODE_ENV !== 'production') {
    const modeSchema = z.object({ mode: z.enum(MOCK_PROVIDER_MODES) }).strict();
    const provider = new MockProvider(app.redis, app.config.MOCK_PROVIDER_MODE);

    app.get('/api/dev/mock-provider', { preHandler: requireRole('owner', 'dispatcher') }, async () => ({
      data: { mode: await provider.mode(), modes: MOCK_PROVIDER_MODES },
    }));

    app.put('/api/dev/mock-provider', { preHandler: requireRole('owner', 'dispatcher') }, async (request) => {
      const { mode } = parse(modeSchema, request.body);
      const stored = await app.redis.set(MOCK_MODE_KEY, mode);
      if (stored !== 'OK') throw new AppError(503, 'UNAVAILABLE', 'Could not update the mock provider.');
      request.log.info({ mode }, 'mock provider mode changed');
      return { data: { mode } };
    });
  }
}
