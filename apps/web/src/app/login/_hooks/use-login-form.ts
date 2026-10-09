'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { loginSchema, type LoginValues } from '../_schemas/login.schema';
import { useLogin } from '@/modules/auth/hooks/use-login';
import { useSession } from '@/modules/auth/hooks/use-session';
import { safeReturnPath } from '@/modules/auth/utils/return-path';
import {
  dismissAuthNotifications,
  notifyAuthError,
} from '@/modules/auth/utils/auth-notifications';

export function useLoginForm() {
  const mutation = useLogin();
  const { session, changing, checking, identityVersion } = useSession();
  const router = useRouter();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { resetField } = form;
  useEffect(() => {
    if (session.data || identityVersion > 0) resetField('password');
  }, [session.data, identityVersion, resetField]);
  const pending = form.formState.isSubmitting || mutation.isPending;
  const blocked =
    pending || changing || session.isPending || session.isError || checking;
  async function submit(values: LoginValues) {
    if (blocked) return;
    dismissAuthNotifications();
    try {
      await mutation.mutateAsync(values);
      form.reset();
      router.replace(
        safeReturnPath(
          new URLSearchParams(window.location.search).get('returnTo'),
        ),
      );
    } catch (error) {
      form.resetField('password');
      notifyAuthError('login', error);
    } finally {
      // Mutation variables must not retain passwords after completion.
      mutation.reset();
    }
  }
  return {
    form,
    submit: form.handleSubmit(submit),
    pending,
    blocked,
    inputsDisabled: pending || session.isPending,
    checking: session.isFetching && !pending,
  };
}
