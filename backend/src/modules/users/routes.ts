import argon2 from 'argon2';
import { Router } from 'express';
import { z } from 'zod';
import { writeAudit } from '../../../../shared/audit';
import { pool, withTransaction } from '../../../../shared/db';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { destroyUserSessions } from '../../lib/session';
import { authOf, requirePermission } from '../../middleware/auth';
import { parseBody, parseParams, parseQuery, uuidParam } from '../../middleware/validate';
import { ROLES, type Role } from '../../types';

interface UserRow {
  id: string; email: string; name: string; role: Role; is_active: boolean; created_at: Date; updated_at: Date;
}
const USER_COLUMNS = 'id, email, name, role, is_active, created_at, updated_at';
const toUser = (r: UserRow) => ({
  id: r.id, email: r.email, name: r.name, role: r.role, isActive: r.is_active,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

const listQuery = z.object({
  role: z.enum(ROLES as [Role, ...Role[]]).optional(),
  active: z.enum(['true', 'false']).optional(),
});

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(120),
  role: z.enum(ROLES as [Role, ...Role[]]),
  password: z.string().min(12, 'must be at least 12 characters').max(200),
}).strict();

const updateSchema = z.object({
  role: z.enum(ROLES as [Role, ...Role[]]).optional(),
  isActive: z.boolean().optional(),
  name: z.string().trim().min(1).max(120).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'at least one field is required');

export function usersRouter(): Router {
  const router = Router();

  router.get('/', requirePermission('users:read'), async (req, res) => {
    const { orgId } = authOf(req);
    const q = parseQuery(req, listQuery);
    const { rows } = await pool.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users
        WHERE org_id = $1 AND ($2::text IS NULL OR role = $2) AND ($3::boolean IS NULL OR is_active = $3)
        ORDER BY role, name`,
      [orgId, q.role ?? null, q.active === undefined ? null : q.active === 'true'],
    );
    res.json({ data: rows.map(toUser) });
  });

  router.post('/', requirePermission('users:manage'), async (req, res) => {
    const auth = authOf(req);
    const body = parseBody(req, createSchema);
    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    const user = await withTransaction(async (tx) => {
      const exists = await tx.query('SELECT 1 FROM users WHERE lower(email) = $1', [body.email]);
      if (exists.rowCount) throw conflict('EMAIL_TAKEN', 'A user with this email already exists');
      const { rows } = await tx.query<UserRow>(
        `INSERT INTO users (org_id, email, name, role, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING ${USER_COLUMNS}`,
        [auth.orgId, body.email, body.name, body.role, passwordHash],
      );
      const created = rows[0]!;
      await writeAudit(tx, {
        orgId: auth.orgId, actorType: 'user', actorId: auth.userId, action: 'user.created',
        targetType: 'user', targetId: created.id, after: { email: created.email, role: created.role }, requestId: String(req.id),
      });
      return created;
    });
    res.status(201).json({ data: toUser(user) });
  });

  router.patch('/:id', requirePermission('users:manage'), async (req, res) => {
    const auth = authOf(req);
    const { id } = parseParams(req, uuidParam);
    const body = parseBody(req, updateSchema);
    if (id === auth.userId && (body.role !== undefined || body.isActive === false)) {
      throw badRequest('You cannot change your own role or deactivate yourself');
    }
    const updated = await withTransaction(async (tx) => {
      // Scoped by org_id from the session: another organisation's user ID is simply "not found".
      const { rows } = await tx.query<UserRow>(
        `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND org_id = $2 FOR UPDATE`,
        [id, auth.orgId],
      );
      const before = rows[0];
      if (!before) throw notFound('User');

      const losesTechnicianDuty =
        before.role === 'technician' && ((body.role && body.role !== 'technician') || body.isActive === false);
      if (losesTechnicianDuty) {
        const active = await tx.query(
          `SELECT reference FROM work_orders
            WHERE org_id = $1 AND technician_id = $2 AND status NOT IN ('completed','cancelled') LIMIT 5`,
          [auth.orgId, id],
        );
        if (active.rowCount) {
          throw conflict('USER_HAS_ACTIVE_ASSIGNMENTS', 'Reassign this technician’s active work orders first', {
            workOrders: active.rows.map((r) => r.reference),
          });
        }
      }

      const r = await tx.query<UserRow>(
        `UPDATE users SET role = COALESCE($3, role), is_active = COALESCE($4, is_active), name = COALESCE($5, name)
          WHERE id = $1 AND org_id = $2 RETURNING ${USER_COLUMNS}`,
        [id, auth.orgId, body.role ?? null, body.isActive ?? null, body.name ?? null],
      );
      const after = r.rows[0]!;
      if (before.role !== after.role) {
        await writeAudit(tx, {
          orgId: auth.orgId, actorType: 'user', actorId: auth.userId, action: 'user.role_changed',
          targetType: 'user', targetId: id, before: { role: before.role }, after: { role: after.role }, requestId: String(req.id),
        });
      }
      if (before.is_active !== after.is_active) {
        await writeAudit(tx, {
          orgId: auth.orgId, actorType: 'user', actorId: auth.userId, action: 'user.status_changed',
          targetType: 'user', targetId: id, before: { isActive: before.is_active }, after: { isActive: after.is_active },
          requestId: String(req.id),
        });
        // Deactivation ends existing sessions immediately.
        if (!after.is_active) await destroyUserSessions(tx, id);
      }
      return after;
    });
    res.json({ data: toUser(updated) });
  });

  return router;
}
