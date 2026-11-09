import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../domain/errors/index.js';
import { logger } from '../../infrastructure/logger.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const correlationId = req.correlationId || 'unknown';

  if (err instanceof AppError) {
    logger.warn(
      {
        err: err.message,
        code: err.code,
        statusCode: err.statusCode,
        correlationId,
      },
      'Application handled error'
    );

    // If specific error code like TOKEN_REVOKED, ensure matching response structure
    if (err.code === 'TOKEN_REVOKED') {
      res.status(err.statusCode).json({
        type: err.type,
        title: err.title,
        status: err.statusCode,
        code: err.code,
        detail: err.message,
        correlationId,
      });
      return;
    }

    res.status(err.statusCode).json({
      type: err.type,
      title: err.title,
      status: err.statusCode,
      code: err.code,
      detail: err.message,
      ...(err.errors ? { errors: err.errors } : {}),
      correlationId,
    });
    return;
  }

  // Unhandled / 500 error
  logger.error(
    {
      err: err.stack,
      correlationId,
    },
    'Unhandled server error'
  );

  res.status(500).json({
    type: 'https://api.fielddesk.internal/errors/internal-server-error',
    title: 'Internal Server Error',
    status: 500,
    code: 'INTERNAL_SERVER_ERROR',
    detail: 'An unexpected internal error occurred. Please contact support.',
    correlationId,
  });
}

