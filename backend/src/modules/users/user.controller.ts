import type { RequestHandler } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import type { Database } from '../../database/pool.js';
import { inTransaction } from '../../database/pool.js';
import { getIdentity } from '../auth/auth.middleware.js';
import type { RuntimeServices } from '../../infrastructure/runtime.js';

const idParams = z.object({ id: z.string().uuid() });
const createSchema = z.object({
  name: z.string().trim().min(1).max(160), email: z.string().trim().email().max(320).transform((v) => v.toLowerCase()),
  password: z.string().min(10).max(128), role: z.enum(['owner', 'dispatcher', 'technician'])
}).strict();
const updateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(), email: z.string().trim().email().max(320).transform((v) => v.toLowerCase()).optional(),
  password: z.string().min(10).max(128).optional(), role: z.enum(['owner', 'dispatcher', 'technician']).optional(), isActive: z.boolean().optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');
const columns = `id, name, email, role, is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"`;

export function listUsers(database: Database): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity);
    const query = z.object({ role: z.enum(['owner', 'dispatcher', 'technician']).optional(), active: z.enum(['true', 'false']).optional(), search: z.string().trim().max(200).optional() }).parse(request.query);
    const params: unknown[] = [identity.organisationId]; const where = ['organisation_id = $1'];
    if (query.role) { params.push(query.role); where.push(`role = $${params.length}`); }
    if (query.active) { params.push(query.active === 'true'); where.push(`is_active = $${params.length}`); }
    if (query.search) { params.push(`%${query.search}%`); where.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`); }
    const result = await database.query(`SELECT ${columns} FROM users WHERE ${where.join(' AND ')} ORDER BY name`, params);
    response.json({ data: result.rows });
  });
}

export function createUser(database: Database, runtime: RuntimeServices): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity); const input = createSchema.parse(request.body);
    try {
      const passwordHash = await argon2.hash(input.password);
      const row = await inTransaction(database, async (client) => {
        const result = await client.query(`INSERT INTO users (organisation_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING ${columns}`, [identity.organisationId, input.name, input.email, passwordHash, input.role]);
        await client.query(`INSERT INTO audit_entries (organisation_id, actor_user_id, action, target_type, target_id, after_data) VALUES ($1, $2, 'user.created', 'user', $3, $4)`, [identity.organisationId, identity.userId, result.rows[0].id, result.rows[0]]);
        return result.rows[0];
      });
      await runtime.publish(identity.organisationId, 'user.created', row); response.status(201).json({ data: row });
    } catch (error) { if ((error as { code?: string }).code === '23505') throw conflict('Email already exists in this organisation'); throw error; }
  });
}

export function updateUser(database: Database, runtime: RuntimeServices): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity); const { id } = idParams.parse(request.params); const input = updateSchema.parse(request.body);
    if (id === identity.userId && (input.isActive === false || (input.role && input.role !== 'owner'))) throw badRequest('An owner cannot deactivate or demote their own account');
    try {
      const row = await inTransaction(database, async (client) => {
        const prior = await client.query(`SELECT ${columns} FROM users WHERE organisation_id = $1 AND id = $2 FOR UPDATE`, [identity.organisationId, id]);
        if (!prior.rows[0]) throw notFound('User not found');
        if (prior.rows[0].role === 'owner' && (input.role && input.role !== 'owner' || input.isActive === false)) {
          await client.query('SELECT id FROM organisations WHERE id = $1 FOR UPDATE', [identity.organisationId]);
          const otherOwner = await client.query(`SELECT 1 FROM users WHERE organisation_id = $1 AND id <> $2 AND role = 'owner' AND is_active LIMIT 1`, [identity.organisationId, id]);
          if (!otherOwner.rowCount) throw badRequest('An organisation must retain at least one active owner');
        }
        const values: unknown[] = []; const sets: string[] = [];
        for (const [key, value] of Object.entries(input)) {
          const column = { name: 'name', email: 'email', role: 'role', isActive: 'is_active' }[key as 'name'];
          if (key === 'password') { values.push(await argon2.hash(value as string)); sets.push(`password_hash = $${values.length + 2}`); }
          else { values.push(value); sets.push(`${column} = $${values.length + 2}`); }
        }
        const securityChange = input.password !== undefined || input.role !== undefined || input.isActive !== undefined;
        if (securityChange) sets.push('token_version = token_version + 1');
        const result = await client.query(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE organisation_id = $1 AND id = $2 RETURNING ${columns}`, [identity.organisationId, id, ...values]);
        await client.query(`INSERT INTO audit_entries (organisation_id, actor_user_id, action, target_type, target_id, before_data, after_data) VALUES ($1, $2, $3, 'user', $4, $5, $6)`, [identity.organisationId, identity.userId, input.role ? 'user.role_changed' : 'user.updated', id, prior.rows[0], result.rows[0]]);
        return result.rows[0];
      });
      await runtime.publish(identity.organisationId, 'user.updated', row); response.json({ data: row });
    } catch (error) { if ((error as { code?: string }).code === '23505') throw conflict('Email already exists in this organisation'); throw error; }
  });
}
