import type { RequestHandler } from 'express';
import argon2 from 'argon2';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { unauthorised } from '../../common/errors.js';
import type { Config } from '../../config.js';
import type { Database } from '../../database/pool.js';
import { inTransaction } from '../../database/pool.js';
import { getIdentity } from './auth.middleware.js';
import type { Role } from './auth.types.js';

const credentials = z.object({
  organisation: z.string().trim().min(1).max(80).transform((value) => value.toLowerCase()),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
}).strict();
const refreshInput = z.object({ refreshToken: z.string().min(32).optional() }).strict();

interface UserRow {
  id: string; organisation_id: string; name: string; email: string;
  password_hash: string; role: Role; token_version: number;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function signAccessToken(user: UserRow, config: Config) {
  const options: SignOptions = {
    algorithm: 'HS256', issuer: 'fielddesk-api', audience: 'fielddesk-web',
    expiresIn: config.JWT_EXPIRES_IN as Exclude<SignOptions['expiresIn'], undefined>
  };
  return jwt.sign({ organisationId: user.organisation_id, role: user.role, tokenVersion: user.token_version }, config.JWT_SECRET, { ...options, subject: user.id });
}

async function createRefreshSession(database: Database, user: UserRow, config: Config) {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_DAYS * 86_400_000);
  await database.query(`INSERT INTO refresh_sessions (organisation_id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`, [user.organisation_id, user.id, hashToken(token), expiresAt]);
  return { token, expiresAt };
}

function setRefreshCookie(response: Parameters<RequestHandler>[1], token: string, expiresAt: Date, config: Config) {
  response.cookie('fielddesk_refresh', token, { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'strict', expires: expiresAt, path: '/api/v1/auth' });
}

export function login(database: Database, config: Config): RequestHandler {
  return asyncHandler(async (request, response) => {
    const input = credentials.parse(request.body);
    const result = await database.query<UserRow>(`
      SELECT u.id, u.organisation_id, u.name, u.email, u.password_hash, u.role, u.token_version
      FROM users u JOIN organisations o ON o.id = u.organisation_id
      WHERE o.slug = $1 AND lower(u.email) = $2 AND u.is_active = true
    `, [input.organisation, input.email]);
    const user = result.rows[0];
    if (!user || !(await argon2.verify(user.password_hash, input.password))) throw unauthorised('Invalid organisation, email, or password');
    const refresh = await createRefreshSession(database, user, config);
    setRefreshCookie(response, refresh.token, refresh.expiresAt, config);
    response.json({ data: { accessToken: signAccessToken(user, config), tokenType: 'Bearer', expiresIn: config.JWT_EXPIRES_IN, user: { id: user.id, name: user.name, email: user.email, role: user.role, organisationId: user.organisation_id } } });
  });
}

export function refresh(database: Database, config: Config): RequestHandler {
  return asyncHandler(async (request, response) => {
    const body = refreshInput.parse(request.body ?? {});
    const token = body.refreshToken ?? request.cookies?.fielddesk_refresh as string | undefined;
    if (!token) throw unauthorised('Refresh token required');
    const result = await database.query<UserRow>(`
      SELECT u.id, u.organisation_id, u.name, u.email, u.password_hash, u.role, u.token_version
      FROM refresh_sessions s JOIN users u ON u.id = s.user_id AND u.organisation_id = s.organisation_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active = true
    `, [hashToken(token)]);
    const user = result.rows[0];
    if (!user) throw unauthorised('Invalid or expired refresh token');
    const nextRefresh = await inTransaction(database, async (client) => {
      const revoked = await client.query(`UPDATE refresh_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id`, [hashToken(token)]);
      if (!revoked.rowCount) throw unauthorised('Refresh token already used');
      const next = randomBytes(48).toString('base64url');
      const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_DAYS * 86_400_000);
      await client.query(`INSERT INTO refresh_sessions (organisation_id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`, [user.organisation_id, user.id, hashToken(next), expiresAt]);
      return { token: next, expiresAt };
    });
    setRefreshCookie(response, nextRefresh.token, nextRefresh.expiresAt, config);
    response.json({ data: { accessToken: signAccessToken(user, config), tokenType: 'Bearer', expiresIn: config.JWT_EXPIRES_IN } });
  });
}

export function me(database: Database): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity);
    const result = await database.query(`SELECT u.id, u.name, u.email, u.role, o.id AS "organisationId", o.name AS "organisationName", o.slug AS "organisationSlug" FROM users u JOIN organisations o ON o.id = u.organisation_id WHERE u.id = $1 AND u.organisation_id = $2`, [identity.userId, identity.organisationId]);
    response.json({ data: result.rows[0] });
  });
}

export function logout(database: Database, config: Config): RequestHandler {
  return asyncHandler(async (request, response) => {
    const identity = getIdentity(request.identity);
    await inTransaction(database, async (client) => {
      await client.query('UPDATE users SET token_version = token_version + 1, updated_at = now() WHERE id = $1 AND organisation_id = $2', [identity.userId, identity.organisationId]);
      await client.query('UPDATE refresh_sessions SET revoked_at = now() WHERE user_id = $1 AND organisation_id = $2 AND revoked_at IS NULL', [identity.userId, identity.organisationId]);
    });
    response.clearCookie('fielddesk_refresh', { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'strict', path: '/api/v1/auth' });
    response.status(204).send();
  });
}
