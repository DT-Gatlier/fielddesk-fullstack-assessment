import type pg from "pg";
import type { UserRecord, UserRole } from "../types/auth.js";

type UserRow = {
  id: string;
  organisation_id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  password_hash?: string;
};

function mapUser(row: UserRow, includePassword = false): UserRecord & { passwordHash?: string } {
  const user: UserRecord & { passwordHash?: string } = {
    id: row.id,
    organisationId: row.organisation_id,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
  };

  if (includePassword && row.password_hash) {
    user.passwordHash = row.password_hash;
  }

  return user;
}

export async function findUserByEmailWithPassword(
  pool: pg.Pool,
  email: string,
): Promise<(UserRecord & { passwordHash: string }) | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, organisation_id, email, role, is_active, password_hash
     FROM users
     WHERE email = $1 AND is_active = true`,
    [email.toLowerCase()],
  );

  if (!result.rowCount) {
    return null;
  }

  const user = mapUser(result.rows[0], true);
  if (!user.passwordHash) {
    return null;
  }

  return user as UserRecord & { passwordHash: string };
}

export async function findUserByIdInOrg(
  pool: pg.Pool,
  userId: string,
  organisationId: string,
): Promise<UserRecord | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, organisation_id, email, role, is_active
     FROM users
     WHERE id = $1 AND organisation_id = $2`,
    [userId, organisationId],
  );

  if (!result.rowCount) {
    return null;
  }

  return mapUser(result.rows[0]);
}

export async function listUsersInOrg(
  pool: pg.Pool,
  organisationId: string,
): Promise<UserRecord[]> {
  const result = await pool.query<UserRow>(
    `SELECT id, organisation_id, email, role, is_active
     FROM users
     WHERE organisation_id = $1
     ORDER BY email`,
    [organisationId],
  );

  return result.rows.map((row) => mapUser(row));
}
