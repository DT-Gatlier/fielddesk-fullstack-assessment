import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/error';

const request = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock('@/api/client', () => ({ apiClient: () => request }));
import {
  authEpoch,
  getCsrf,
  resetAuthTransport,
  withCsrf,
} from './auth-transport';
import { getSession } from './auth-query';
import { login } from './auth-mutations';

beforeEach(() => {
  resetAuthTransport();
  vi.resetAllMocks();
});
it('deduplicates CSRF requests', async () => {
  request.GET.mockResolvedValue({ data: { csrfToken: 'first' } });
  expect(await Promise.all([getCsrf(), getCsrf()])).toEqual(['first', 'first']);
  expect(request.GET).toHaveBeenCalledTimes(1);
});
it('recovers only an identified CSRF rejection once', async () => {
  request.GET.mockResolvedValueOnce({
    data: { csrfToken: 'old' },
  }).mockResolvedValueOnce({ data: { csrfToken: 'new' } });
  const operation = vi
    .fn()
    .mockRejectedValueOnce(new ApiError('Invalid CSRF token', 403, 'FORBIDDEN'))
    .mockResolvedValueOnce('ok');
  expect(await withCsrf(operation)).toBe('ok');
  expect(operation.mock.calls).toEqual([['old'], ['new']]);
});
it('never retries credentials or unrelated forbidden responses', async () => {
  request.GET.mockResolvedValue({ data: { csrfToken: 'token' } });
  request.POST.mockRejectedValue(new ApiError('Invalid credentials', 401));
  await expect(
    login({ email: 'user@example.org', password: 'password' }),
  ).rejects.toMatchObject({ status: 401 });
  expect(request.POST).toHaveBeenCalledTimes(1);
  const operation = vi
    .fn()
    .mockRejectedValue(new ApiError('Origin not allowed', 403, 'FORBIDDEN'));
  await expect(withCsrf(operation)).rejects.toMatchObject({ status: 403 });
  expect(operation).toHaveBeenCalledTimes(1);
});
it('rejects old identity responses after authentication changes', async () => {
  let resolve: (value: unknown) => void = () => {};
  request.GET.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const pending = getSession();
  const previous = authEpoch();
  resetAuthTransport();
  expect(authEpoch()).toBeGreaterThan(previous);
  resolve({ data: { user: { name: 'Previous user' } } });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
it('distinguishes expired sessions from dependency failure', async () => {
  request.GET.mockRejectedValueOnce(
    new ApiError('Expired', 401),
  ).mockRejectedValueOnce(new ApiError('Unavailable', 503));
  expect(await getSession()).toBeNull();
  await expect(getSession()).rejects.toMatchObject({ status: 503 });
});
