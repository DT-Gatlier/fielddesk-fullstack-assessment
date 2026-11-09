import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-correlation-id'] as string | undefined;
  const correlationId = incomingId || `req_${crypto.randomUUID()}`;
  
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
}

