import { Request, Response, NextFunction } from 'express';
import { logger } from '../../infrastructure/logger.js';

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startNs = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    const routePath = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : req.originalUrl.split('?')[0];

    const logPayload = {
      correlationId: req.correlationId,
      organisationId: req.tenantContext?.organisationId ?? null,
      userId: req.tenantContext?.userId ?? null,
      method: req.method,
      route: routePath,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    };

    if (res.statusCode >= 500) {
      logger.error(logPayload, 'HTTP request failed');
    } else if (res.statusCode >= 400) {
      logger.warn(logPayload, 'HTTP request rejected');
    } else {
      logger.info(logPayload, 'HTTP request completed');
    }
  });

  next();
}

