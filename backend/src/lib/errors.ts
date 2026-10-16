/**
 * Every error the API returns has the same shape:
 *   { "error": { "code", "message", "details"?, "requestId" } }
 * Throw an AppError (or a subclass) anywhere; the central error handler formats it.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const unauthenticated = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'FORBIDDEN', message);
/**
 * Used both for genuinely missing records and for records owned by another
 * organisation, so responses never reveal that another tenant's ID exists.
 */
export const notFound = (resource = 'Resource') => new AppError(404, 'NOT_FOUND', `${resource} not found`);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);
