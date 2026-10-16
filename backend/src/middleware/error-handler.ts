import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

/** Converts any thrown value into the standard error envelope. */
function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return new AppError(400, 'VALIDATION_FAILED', 'Request validation failed', err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })));
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return new AppError(413, 'FILE_TOO_LARGE', 'File exceeds the maximum upload size');
    return new AppError(400, 'INVALID_UPLOAD', err.message);
  }

  const e = err as PgError & { type?: string; status?: number };
  // express.json() errors
  if (e.type === 'entity.parse.failed') return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  if (e.type === 'entity.too.large') return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');

  // PostgreSQL errors that can surface from a race the service layer did not pre-empt.
  switch (e.code) {
    case '23P01':
      return new AppError(409, 'SCHEDULE_CONFLICT', 'The technician already has an overlapping assignment');
    case '23505':
      return new AppError(409, 'DUPLICATE', 'A record with the same unique value already exists');
    case '23514':
      return new AppError(400, 'CONSTRAINT_VIOLATION', 'The request violates a data rule', { constraint: e.constraint });
    case '55P03':
    case '40001':
    case '40P01':
      return new AppError(503, 'BUSY_RETRY', 'The resource is busy; please retry');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appErr = toAppError(err);
  if (appErr.status >= 500 && appErr.code === 'INTERNAL_ERROR') {
    req.log?.error({ err }, 'unhandled error');
  } else {
    req.log?.info({ code: appErr.code, status: appErr.status }, 'request failed');
  }
  if (res.headersSent) {
    // Streaming responses (CSV, SSE) cannot change status once started.
    res.destroy();
    return;
  }
  res.status(appErr.status).json({
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.details !== undefined ? { details: appErr.details } : {}),
      requestId: String(req.id),
    },
  });
};

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};
