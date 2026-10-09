import { beforeEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { ApiError } from '@/api/error';
import {
  dismissAuthNotifications,
  notifyAuthError,
} from './auth-notifications';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
it('uses safe messages, one operation ID and eight seconds for credentials/network errors', () => {
  notifyAuthError('login', new ApiError('Sensitive server diagnostic', 401));
  expect(toast.error).toHaveBeenCalledExactlyOnceWith(
    'Invalid email or password.',
    { id: 'auth-login', duration: 8000 },
  );
});
it('keeps rate limits and service failures until dismissed and clears stale operations', () => {
  notifyAuthError(
    'login',
    new ApiError('Diagnostic', 429, undefined, undefined, 45),
  );
  expect(toast.error).toHaveBeenCalledWith(
    expect.stringContaining('45 seconds'),
    { id: 'auth-login', duration: Infinity },
  );
  notifyAuthError('logout', new ApiError('Diagnostic', 503));
  expect(toast.error).toHaveBeenCalledWith(
    expect.stringContaining('temporarily unavailable'),
    { id: 'auth-logout', duration: Infinity },
  );
  dismissAuthNotifications();
  expect(toast.dismiss).toHaveBeenCalledWith('auth-login');
  expect(toast.dismiss).toHaveBeenCalledWith('auth-logout');
});
