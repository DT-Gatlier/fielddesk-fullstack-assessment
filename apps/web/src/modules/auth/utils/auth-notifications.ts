import { toast } from 'sonner';
import { ApiError, errorMessage } from '@/api/error';

export function dismissAuthNotifications() {
  toast.dismiss('auth-login');
  toast.dismiss('auth-logout');
}
export function notifyAuthError(operation: 'login' | 'logout', error: unknown) {
  toast.error(errorMessage(error), {
    id: `auth-${operation}`,
    duration:
      error instanceof ApiError && [429, 503].includes(error.status)
        ? Infinity
        : 8000,
  });
}
