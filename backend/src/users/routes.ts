import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recordAudit, userActor } from '../audit/audit.js';
import { authOf, requireRole } from '../auth/guards.js';
import { hashPassword } from '../auth/password.js';
import { ROLES, type Role } from '../auth/sessions.js';
import { withOrg } from '../db/pool.js';
import { conflict, notFound } from '../http/errors.js';
import { parse } from '../http/validation.js';

const listQuerySchema = z.object({
  role: z.enum(ROLES as [Role, ...Role[]]).optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const updateUserSchema = z
  .object({
    role: z.enum(ROLES as [Role, ...Role[]]).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.role !== undefined || value.isActive !== undefined, {
    message: 'Provide at least one of role or isActive.',
  });

const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    name: z.string().trim().min(1).max(200),
    role: z.enum(ROLES as [Role, ...Role[]]),
    password: z.string().min(12, 'Passwords must be at least 12 characters.').max(256),
  })
  .strict();

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
}

const toUser = (row: UserRow) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  isActive: row.is_active,
});

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // Dispatchers need the technician list to assign work; owners manage all users.
  app.get('/api/users', { preHandler: requireRole('owner', 'dispatcher') }, async (request) => {
    const auth = authOf(request);
    const query = parse(listQuerySchema, request.query);
    const rows = await withOrg(app.pg, auth.orgId, async (client) => {
      const result = await client.query<UserRow>(
        `SELECT id, name, email, role, is_active FROM users
         WHERE org_id = $1 AND ($2::user_role IS NULL OR role = $2)
         ORDER BY name`,
        [auth.orgId, query.role ?? null],
      );
      return result.rows;
    });
    return { data: rows.map(toUser) };
  });

  app.post('/api/users', { preHandler: requireRole('owner') }, async (request, reply) => {
    const auth = authOf(request);
    const input = parse(createUserSchema, request.body);
    const passwordHash = await hashPassword(input.password);
    const created = await withOrg(app.pg, auth.orgId, async (client) => {
      const { rows } = await client.query<UserRow>(
        `INSERT INTO users (org_id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, role, is_active`,
        [auth.orgId, input.email, input.name, input.role, passwordHash],
      );
      const user = rows[0]!;
      await recordAudit(client, {
        orgId: auth.orgId,
        actor: userActor(auth),
        action: 'user.created',
        targetType: 'user',
        targetId: user.id,
        after: { email: user.email, name: user.name, role: user.role },
        requestId: request.id,
      });
      return user;
    }).catch((error: { code?: string; constraint?: string }) => {
      if (error.code === '23505' && error.constraint === 'users_email_key') {
        throw conflict('EMAIL_TAKEN', 'A user with this email already exists.');
      }
      throw error;
    });
    return reply.status(201).send({ data: toUser(created) });
  });

  app.patch('/api/users/:id', { preHandler: requireRole('owner') }, async (request) => {
    const auth = authOf(request);
    const { id } = parse(idParamsSchema, request.params);
    const changes = parse(updateUserSchema, request.body);

    const updated = await withOrg(app.pg, auth.orgId, async (client) => {
      // Lock the organisation's active owners so two concurrent demotions cannot both pass the
      // "at least one active owner remains" check.
      const owners = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE org_id = $1 AND role = 'owner' AND is_active ORDER BY id FOR UPDATE`,
        [auth.orgId],
      );

      // org_id in the WHERE clause (and RLS) means another organisation's user id simply is not found.
      const current = await client.query<UserRow>(
        'SELECT id, name, email, role, is_active FROM users WHERE id = $1 AND org_id = $2 FOR UPDATE',
        [id, auth.orgId],
      );
      const before = current.rows[0];
      if (!before) throw notFound('User');

      const nextRole = changes.role ?? before.role;
      const nextActive = changes.isActive ?? before.is_active;
      const losesOwnership = before.role === 'owner' && before.is_active && (nextRole !== 'owner' || !nextActive);
      if (losesOwnership && owners.rows.length <= 1) {
        throw conflict('LAST_OWNER', 'An organisation must keep at least one active owner.');
      }

      const result = await client.query<UserRow>(
        `UPDATE users SET role = $3, is_active = $4 WHERE id = $1 AND org_id = $2
         RETURNING id, name, email, role, is_active`,
        [id, auth.orgId, nextRole, nextActive],
      );
      const after = result.rows[0]!;

      if (before.role !== after.role) {
        await recordAudit(client, {
          orgId: auth.orgId,
          actor: userActor(auth),
          action: 'user.role_changed',
          targetType: 'user',
          targetId: id,
          before: { role: before.role },
          after: { role: after.role },
          requestId: request.id,
        });
      }
      if (before.is_active !== after.is_active) {
        await recordAudit(client, {
          orgId: auth.orgId,
          actor: userActor(auth),
          action: after.is_active ? 'user.activated' : 'user.deactivated',
          targetType: 'user',
          targetId: id,
          before: { isActive: before.is_active },
          after: { isActive: after.is_active },
          requestId: request.id,
        });
      }
      return after;
    });

    return { data: toUser(updated) };
  });
}
