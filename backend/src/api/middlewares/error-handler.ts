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

  // Catch Postgres 23P01 exclusion constraint violation
  if ((err as any).code === '23P01') {
    logger.warn({ err: err.message, correlationId }, 'Postgres exclusion violation (23P01)');
    res.status(409).json({
      type: 'https://api.fielddesk.internal/errors/scheduling-conflict',
      title: 'Scheduling Conflict',
      status: 409,
      code: 'SCHEDULING_CONFLICT',
      detail: 'The technician is already scheduled for an overlapping work order.',
      correlationId,
    });
    return;
  }

  // Catch Multer errors (file size limit, etc.)
  if ((err as any).name === 'MulterError') {
    logger.warn({ err: err.message, code: (err as any).code, correlationId }, 'Multer upload error');
    if ((err as any).code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        type: 'https://api.fielddesk.internal/errors/file-too-large',
        title: 'File Too Large',
        status: 400,
        code: 'FILE_TOO_LARGE',
        detail: 'File size exceeds maximum allowed limit of 10 MB.',
        correlationId,
      });
      return;
    }
    res.status(400).json({
      type: 'https://api.fielddesk.internal/errors/bad-request',
      title: 'Bad Request',
      status: 400,
      code: 'UPLOAD_ERROR',
      detail: err.message,
      correlationId,
    });
    return;
  }

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

    // If specific error code like TOKEN_REVOKED or SCHEDULING_CONFLICT
    if (err.code === 'SCHEDULING_CONFLICT') {
      res.status(err.statusCode).json({
        type: err.type,
        title: err.title,
        status: err.statusCode,
        code: err.code,
        detail: err.message,
        ...((err as any).conflictingWorkOrder ? { conflictingWorkOrder: (err as any).conflictingWorkOrder } : {}),
        correlationId,
      });
      return;
    }

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

