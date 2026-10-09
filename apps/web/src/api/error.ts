export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly requestId?: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function responseError(response: Response, body: unknown): ApiError {
  const record = typeof body === 'object' && body !== null ? body : {};
  const message =
    'message' in record && typeof record.message === 'string'
      ? record.message
      : 'The request could not be completed. Please try again.';
  const rawRetry = response.headers.get('Retry-After');
  const retry = rawRetry === null ? NaN : Number(rawRetry);
  return new ApiError(
    message,
    response.status,
    'code' in record && typeof record.code === 'string'
      ? record.code
      : undefined,
    'requestId' in record && typeof record.requestId === 'string'
      ? record.requestId
      : (response.headers.get('X-Request-ID') ?? undefined),
    Number.isFinite(retry) && retry >= 0 ? Math.ceil(retry) : undefined,
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Invalid email or password.';
    if (error.status === 429) {
      return error.retryAfter === undefined
        ? 'Too many attempts. Please try again later.'
        : `Too many attempts. Please try again in ${error.retryAfter} seconds.`;
    }
    if (error.status === 503)
      return 'The service is temporarily unavailable. Please try again.';
    if (error.status === 403)
      return 'This action is not permitted. Please try again or contact your owner.';
  }
  return 'Unable to connect. Check your connection and try again.';
}
