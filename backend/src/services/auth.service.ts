import argon2 from "argon2";
import type pg from "pg";
import { AppError } from "../lib/errors.js";
import {
  findUserByEmailWithPassword,
  findUserByIdInOrg,
} from "../repositories/users.repository.js";
import type { AuthContext, UserRecord } from "../types/auth.js";

export async function authenticateUser(
  pool: pg.Pool,
  email: string,
  password: string,
): Promise<UserRecord> {
  const user = await findUserByEmailWithPassword(pool, email);

  if (!user) {
    throw new AppError("UNAUTHORIZED", "Invalid email or password", 401);
  }

  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) {
    throw new AppError("UNAUTHORIZED", "Invalid email or password", 401);
  }

  return {
    id: user.id,
    organisationId: user.organisationId,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  };
}

export async function getAuthenticatedUser(
  pool: pg.Pool,
  auth: AuthContext,
): Promise<UserRecord> {
  const user = await findUserByIdInOrg(pool, auth.userId, auth.organisationId);

  if (!user || !user.isActive) {
    throw new AppError("UNAUTHORIZED", "Session is no longer valid", 401);
  }

  return user;
}

export function toAuthContext(user: UserRecord): AuthContext {
  return {
    userId: user.id,
    organisationId: user.organisationId,
    role: user.role,
    email: user.email,
  };
}

export function toPublicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    organisationId: user.organisationId,
  };
}
