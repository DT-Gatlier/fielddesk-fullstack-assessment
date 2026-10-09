import { Logger } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { randomUUID } from 'node:crypto';

import type {
  SecurityRequest,
  SecurityMiddleware,
} from '../interfaces/security-request.interface';

export function requestContextMiddleware(): SecurityMiddleware {
  const logger = new Logger('HTTP');
  return (request: SecurityRequest, response: Response, next: NextFunction) => {
    request.requestId = randomUUID();
    response.setHeader('X-Request-ID', request.requestId);
    if (request.path.startsWith('/api/v1/auth')) {
      response.setHeader('Cache-Control', 'no-store');
    }
    const start = Date.now();
    response.once('finish', () =>
      logger.log(
        JSON.stringify({
          requestId: request.requestId,
          method: request.method,
          status: response.statusCode,
          durationMs: Date.now() - start,
        }),
      ),
    );
    next();
  };
}
