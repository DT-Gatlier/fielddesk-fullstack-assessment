import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { runWithLogContext } from '../../infrastructure/logger.js';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const rawHeader = req.headers['x-correlation-id'];
  const incomingId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const trimmedId = incomingId?.trim();
  const correlationId = trimmedId && trimmedId.length > 0 ? trimmedId : crypto.randomUUID();

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  runWithLogContext({ correlationId }, () => next());
}
