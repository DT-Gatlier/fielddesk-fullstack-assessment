import { AppError } from './app-error.js';

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';
  readonly title = 'Not Found';

  constructor(message = 'Resource not found') {
    super(message);
  }
}

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code: string;
  readonly title = 'Unauthorized';

  constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
    super(message);
    this.code = code;
  }
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';
  readonly title = 'Forbidden';

  constructor(message = 'You do not have permission to access this resource') {
    super(message);
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code: string;
  readonly title = 'Conflict';

  constructor(message = 'Conflict occurred', code = 'CONFLICT') {
    super(message);
    this.code = code;
  }
}

export interface ConflictingWorkOrderDetails {
  id?: string;
  referenceNumber?: string;
  scheduledStart?: string | Date;
  scheduledEnd?: string | Date;
}

export class SchedulingConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'SCHEDULING_CONFLICT';
  readonly title = 'Scheduling Conflict';
  public readonly conflictingWorkOrder?: ConflictingWorkOrderDetails;

  constructor(
    message = 'The technician is already scheduled for an overlapping work order.',
    conflictingWorkOrder?: ConflictingWorkOrderDetails
  ) {
    super(message);
    (this as any).type = 'https://api.fielddesk.internal/errors/scheduling-conflict';
    this.conflictingWorkOrder = conflictingWorkOrder;
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 422;
  readonly code = 'VALIDATION_FAILED';
  readonly title = 'Validation Error';

  constructor(message = 'Validation failed', errors?: unknown[]) {
    super(message, errors);
  }
}

export class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly title = 'Too Many Requests';

  constructor(message = 'Too many requests. Please try again later.') {
    super(message);
  }
}

export class BadRequestError extends AppError {
  readonly statusCode = 400;
  readonly code: string;
  readonly title = 'Bad Request';

  constructor(message = 'Bad request', code = 'BAD_REQUEST') {
    super(message);
    this.code = code;
    (this as any).type = 'https://api.fielddesk.internal/errors/bad-request';
  }
}

export class QuotaExceededError extends AppError {
  readonly statusCode = 422;
  readonly code = 'QUOTA_EXCEEDED';
  readonly title = 'Storage Quota Exceeded';

  constructor(message = 'Organisation storage quota exceeded') {
    super(message);
    (this as any).type = 'https://api.fielddesk.internal/errors/quota-exceeded';
  }
}

export * from './app-error.js';

