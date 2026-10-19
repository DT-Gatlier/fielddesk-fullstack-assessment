import type { FastifyError, FastifyInstance } from 'fastify';

export interface ErrorDetail {
  path?: string;
  message: string;
}

/** An error whose status, code and message are safe to return to the client. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const validationError = (details: ErrorDetail[]) =>
  new AppError(400, 'VALIDATION_FAILED', 'The request is invalid.', details);
export const unauthenticated = (message = 'Authentication is required.') =>
  new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to perform this action.') =>
  new AppError(403, 'FORBIDDEN', message);
// Used for resources in another organisation too, so their existence is not revealed.
export const notFound = (resource = 'Resource') => new AppError(404, 'NOT_FOUND', `${resource} not found.`);
export const conflict = (code: string, message: string, details?: ErrorDetail[]) =>
  new AppError(409, code, message, details);

interface PgError {
  code?: string;
  constraint?: string;
}

function isPgError(error: unknown): error is PgError {
  return typeof error === 'object' && error !== null && typeof (error as PgError).code === 'string';
}

/**
 * Database errors that can surface from a valid request. Services should translate the ones they
 * expect; this is the safety net so a constraint violation never becomes an opaque 500.
 */
function fromDatabaseError(error: PgError): AppError | undefined {
  switch (error.code) {
    case '23P01':
      if (error.constraint === 'work_orders_no_technician_overlap') {
        return conflict('SCHEDULE_CONFLICT', 'The technician is already assigned to an overlapping work order.');
      }
      return conflict('CONFLICT', 'The request conflicts with existing data.');
    case '23505':
      return conflict('DUPLICATE', 'A record with the same unique value already exists.');
    case '23503':
      return new AppError(422, 'INVALID_REFERENCE', 'The request references a record that does not exist.');
    case '23514':
      return new AppError(422, 'CONSTRAINT_VIOLATION', 'The request violates a data constraint.');
    case '40001':
    case '40P01':
      return new AppError(503, 'RETRY_LATER', 'The request could not be completed due to concurrent activity. Retry.');
    default:
      return undefined;
  }
}

/** Every error response has the shape { error: { code, message, details?, requestId } }. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    let appError: AppError;

    if (error instanceof AppError) {
      appError = error;
    } else if (isPgError(error) && fromDatabaseError(error)) {
      appError = fromDatabaseError(error)!;
    } else if ('statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) {
      // Framework-level client errors: malformed JSON, unsupported media type, body too large.
      appError = new AppError(error.statusCode, (error as FastifyError).code ?? 'BAD_REQUEST', error.message);
    } else {
      request.log.error({ err: error }, 'unhandled error');
      appError = new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
    }

    if (appError.statusCode >= 500 && error instanceof AppError) {
      request.log.error({ err: error }, 'server error');
    }

    return reply.status(appError.statusCode).send({
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
        requestId: request.id,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: { code: 'NOT_FOUND', message: 'Route not found.', requestId: request.id },
    });
  });
}
