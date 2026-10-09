import { apiClient } from '@/api/client';
import { ApiError } from '@/api/error';

// An epoch prevents responses from an earlier authentication state being accepted.
let epoch = 0;
let csrfToken: string | undefined;
let csrfRequest: Promise<string> | undefined;
export function resetAuthTransport(): void {
  epoch += 1;
  csrfToken = undefined;
  csrfRequest = undefined;
}
export function invalidateCsrf(): void {
  csrfToken = undefined;
}

export function authEpoch(): number {
  return epoch;
}
export function assertAuthEpoch(expected: number): void {
  if (epoch !== expected)
    throw new DOMException('Authentication changed', 'AbortError');
}

export async function getCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (csrfRequest) return csrfRequest;
  const expected = epoch;
  const request = (async () => {
    const { data } = await apiClient().GET('/api/v1/auth/csrf');
    assertAuthEpoch(expected);
    if (!data) throw new Error('Missing CSRF response');
    csrfToken = data.csrfToken;
    return csrfToken;
  })();
  csrfRequest = request;
  try {
    return await request;
  } finally {
    if (csrfRequest === request) csrfRequest = undefined;
  }
}

export async function withCsrf<T>(
  operation: (token: string) => Promise<T>,
): Promise<T> {
  const expected = epoch;
  try {
    const result = await operation(await getCsrf());
    assertAuthEpoch(expected);
    return result;
  } catch (error) {
    assertAuthEpoch(expected);
    if (
      !(error instanceof ApiError) ||
      error.status !== 403 ||
      error.code !== 'FORBIDDEN' ||
      error.message !== 'Invalid CSRF token'
    )
      throw error;
    csrfToken = undefined;
    const result = await operation(await getCsrf());
    assertAuthEpoch(expected);
    return result;
  }
}
