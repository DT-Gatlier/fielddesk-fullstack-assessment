import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../infrastructure/config.js';
import { isTokenRevoked } from '../../infrastructure/redis.js';
import { JwtPayload } from '../../services/auth.service.js';
import { UnauthorizedError } from '../../domain/errors/index.js';
import { sseManager } from '../../realtime/sse-manager.js';

const router = Router();

router.get('/stream', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token =
    (typeof req.query.token === 'string' ? req.query.token.trim() : null) ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7).trim() : null);

  if (!token) {
    next(new UnauthorizedError('Missing authentication token for real-time event stream.', 'UNAUTHORIZED'));
    return;
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;

    if (decoded.jti) {
      const revoked = await isTokenRevoked(decoded.jti);
      if (revoked) {
        next(new UnauthorizedError('Token has been revoked. Please log in again.', 'TOKEN_REVOKED'));
        return;
      }
    }

    sseManager.addClient(decoded.orgId, req, res, decoded.orgId);
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
});

export default router;
