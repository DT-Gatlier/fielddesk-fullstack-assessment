import { query } from '../infrastructure/db.js';
import { User, RefreshToken } from '../domain/models/user.model.js';

export class UserRepository {
  /**
   * Find a user by email, joining organisation name.
   */
  async findByEmail(email: string): Promise<User | null> {
    const sql = `
      SELECT 
        u.id, 
        u.organisation_id, 
        u.email, 
        u.password_hash, 
        u.name, 
        u.role, 
        u.is_active, 
        u.created_at, 
        u.updated_at,
        o.name AS organisation_name
      FROM users u
      JOIN organisations o ON o.id = u.organisation_id
      WHERE LOWER(u.email) = LOWER($1)
      LIMIT 1
    `;

    const result = await query(sql, [email]);
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      organisationId: row.organisation_id,
      email: row.email,
      passwordHash: row.password_hash,
      name: row.name,
      role: row.role,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      organisationName: row.organisation_name,
    };
  }

  /**
   * Find a user by ID and Organisation ID (Strict tenant isolation)
   */
  async findUserByIdAndOrg(userId: string, orgId: string): Promise<User | null> {
    const sql = `
      SELECT 
        u.id, 
        u.organisation_id, 
        u.email, 
        u.password_hash, 
        u.name, 
        u.role, 
        u.is_active, 
        u.created_at, 
        u.updated_at,
        o.name AS organisation_name
      FROM users u
      JOIN organisations o ON o.id = u.organisation_id
      WHERE u.id = $1 AND u.organisation_id = $2
      LIMIT 1
    `;

    const result = await query(sql, [userId, orgId]);
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      organisationId: row.organisation_id,
      email: row.email,
      passwordHash: row.password_hash,
      name: row.name,
      role: row.role,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      organisationName: row.organisation_name,
    };
  }

  /**
   * Store a new refresh token hash in the database
   */
  async createRefreshToken(
    userId: string,
    orgId: string,
    tokenHash: string,
    expiresAt: Date
  ): Promise<RefreshToken> {
    const sql = `
      INSERT INTO refresh_tokens (user_id, organisation_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, organisation_id, token_hash, expires_at, revoked_at, created_at
    `;

    const result = await query(sql, [userId, orgId, tokenHash, expiresAt.toISOString()]);
    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      organisationId: row.organisation_id,
      tokenHash: row.token_hash,
      expiresAt: new Date(row.expires_at),
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Find an active (non-revoked, non-expired) refresh token by its hash
   */
  async findActiveRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | null> {
    const sql = `
      SELECT id, user_id, organisation_id, token_hash, expires_at, revoked_at, created_at
      FROM refresh_tokens
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
      LIMIT 1
    `;

    const result = await query(sql, [tokenHash]);
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      organisationId: row.organisation_id,
      tokenHash: row.token_hash,
      expiresAt: new Date(row.expires_at),
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Revoke a refresh token by ID (e.g., during token rotation)
   */
  async revokeRefreshToken(id: string): Promise<void> {
    const sql = `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE id = $1
    `;
    await query(sql, [id]);
  }

  /**
   * Revoke all refresh tokens for a user (e.g., during global logout or password reset)
   */
  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    const sql = `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = $1 AND revoked_at IS NULL
    `;
    await query(sql, [userId]);
  }
}

export const userRepository = new UserRepository();

