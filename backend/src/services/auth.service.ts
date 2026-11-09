import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../infrastructure/config.js';
import {
  checkAuthRateLimit,
  clearAuthRateLimit,
  recordFailedAuthAttempt,
  revokeToken,
} from '../infrastructure/redis.js';
import { userRepository } from '../repositories/user.repository.js';
import { UserProfile } from '../domain/models/user.model.js';
import {
  UnauthorizedError,
  NotFoundError,
  RateLimitError,
} from '../domain/errors/index.js';

export interface JwtPayload {
  sub: string;
  orgId: string;
  role: 'owner' | 'dispatcher' | 'technician';
  jti: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * Hashes an opaque refresh token using SHA-256 for secure storage.
 */
function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generates a signed Access Token (15 minutes TTL)
 */
function generateAccessToken(user: { id: string; organisationId: string; role: any }): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const payload: JwtPayload = {
    sub: user.id,
    orgId: user.organisationId,
    role: user.role,
    jti,
  };

  const token = jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN, // 900 seconds (15 mins)
  });

  return { token, jti };
}

/**
 * Generates a cryptographically secure random refresh token (7 days TTL)
 */
async function generateAndStoreRefreshToken(userId: string, orgId: string): Promise<string> {
  const rawToken = `ref_${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await userRepository.createRefreshToken(userId, orgId, tokenHash, expiresAt);
  return rawToken;
}

export class AuthService {
  /**
   * Authenticate user credentials with brute-force rate-limiting
   */
  async login(email: string, passwordPlain: string, ip: string): Promise<AuthTokens> {
    // 1. Check rate limit for IP
    const { allowed } = await checkAuthRateLimit(ip);
    if (!allowed) {
      throw new RateLimitError('Too many failed login attempts. Please try again in 5 minutes.');
    }

    // 2. Lookup user by email
    const user = await userRepository.findByEmail(email);
    if (!user || !user.isActive) {
      await recordFailedAuthAttempt(ip);
      throw new UnauthorizedError('Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    // 3. Verify bcrypt password hash
    const isPasswordValid = await bcrypt.compare(passwordPlain, user.passwordHash);
    if (!isPasswordValid) {
      await recordFailedAuthAttempt(ip);
      throw new UnauthorizedError('Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    // 4. Clear failed attempts on successful login
    await clearAuthRateLimit(ip);

    // 5. Generate tokens
    const { token: accessToken } = generateAccessToken(user);
    const refreshToken = await generateAndStoreRefreshToken(user.id, user.organisationId);

    const userProfile: UserProfile = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organisationId: user.organisationId,
      organisationName: user.organisationName ?? '',
    };

    return {
      accessToken,
      refreshToken,
      user: userProfile,
    };
  }

  /**
   * Refresh Token rotation: Burns the old refresh token and issues a new token pair
   */
  async refresh(rawRefreshToken: string): Promise<RefreshResult> {
    const tokenHash = hashToken(rawRefreshToken);
    const storedToken = await userRepository.findActiveRefreshTokenByHash(tokenHash);

    if (!storedToken) {
      throw new UnauthorizedError('Invalid or expired refresh token. Please log in again.', 'INVALID_REFRESH_TOKEN');
    }

    // Burn old refresh token immediately (Token Rotation)
    await userRepository.revokeRefreshToken(storedToken.id);

    // Retrieve user ensuring account is still active
    const user = await userRepository.findUserByIdAndOrg(storedToken.userId, storedToken.organisationId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User account is inactive or no longer exists.', 'USER_INACTIVE');
    }

    // Mint new pair
    const { token: accessToken } = generateAccessToken(user);
    const newRefreshToken = await generateAndStoreRefreshToken(user.id, user.organisationId);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Logout: Revokes refresh tokens and adds the access token JTI to the Redis blocklist
   */
  async logout(userId: string, jti: string, exp?: number): Promise<void> {
    // 1. Revoke all refresh tokens for this user
    await userRepository.revokeAllUserRefreshTokens(userId);

    // 2. Add JTI to Redis blocklist with exact remaining TTL
    if (jti && exp) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const remainingSeconds = exp - nowSeconds;
      if (remainingSeconds > 0) {
        await revokeToken(jti, remainingSeconds);
      }
    }
  }

  /**
   * Get authenticated user profile (enforcing tenant context)
   */
  async getMe(userId: string, orgId: string): Promise<UserProfile> {
    const user = await userRepository.findUserByIdAndOrg(userId, orgId);
    if (!user) {
      throw new NotFoundError('User profile not found.');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organisationId: user.organisationId,
      organisationName: user.organisationName ?? '',
    };
  }
}

export const authService = new AuthService();
