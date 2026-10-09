import { expect, it } from 'vitest';
import { ApiError, errorMessage, responseError } from './error';

it('preserves safe error metadata and rounds retry time', () => {
  const error = responseError(
    new Response(null, {
      status: 429,
      headers: { 'Retry-After': '2.2', 'X-Request-ID': 'request-1' },
    }),
    { code: 'RATE_LIMITED', message: 'Slow down' },
  );
  expect(error).toMatchObject({
    status: 429,
    code: 'RATE_LIMITED',
    requestId: 'request-1',
    retryAfter: 3,
  });
  expect(errorMessage(error)).toContain('3 seconds');
});
it('handles malformed errors without disclosing arbitrary server messages', () => {
  expect(
    responseError(new Response(null, { status: 500 }), '<html>'),
  ).toBeInstanceOf(ApiError);
  expect(errorMessage(new Error('private driver detail'))).not.toContain(
    'private',
  );
});
