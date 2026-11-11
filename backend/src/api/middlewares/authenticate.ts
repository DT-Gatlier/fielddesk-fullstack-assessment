import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../infrastructure/config.js';
import { updateLogContext } from '../../infrastructure/logger.js';
import { isTokenRevoked } from '../../infrastructure/redis.js';
import { TenantContext } from '../../domain/models/tenant-context.js';
import { JwtPayload } from '../../services/auth.service.js';
import { UnauthorizedError } from '../../domain/errors/index.js';

declare global {
  namespace Express {
    interface Request {
      tenantContext: TenantContext;
      tokenPayload: JwtPayload;
      accessToken: string;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or malformed Authorization header.', 'UNAUTHORIZED'));
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    next(new UnauthorizedError('Bearer token is empty.', 'UNAUTHORIZED'));
    return;
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;

    // Check Redis revocation blocklist
    if (decoded.jti) {
      const revoked = await isTokenRevoked(decoded.jti);
      if (revoked) {
        next(new UnauthorizedError('Token has been revoked. Please log in again.', 'TOKEN_REVOKED'));
        return;
      }
    }

    // Attach tenant context and payload
    req.tenantContext = {
      organisationId: decoded.orgId,
      userId: decoded.sub,
      role: decoded.role,
      correlationId: req.correlationId || '',
    };
    updateLogContext({
      organisationId: decoded.orgId,
      userId: decoded.sub,
    });
    req.tokenPayload = decoded;
    req.accessToken = token;

    next();
  } catch (err: any) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token has expired. Please refresh your session.', 'TOKEN_EXPIRED'));
      return;
    }
    if (err instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token signature or payload.', 'INVALID_TOKEN'));
      return;
    }
    next(err);
  }
}

