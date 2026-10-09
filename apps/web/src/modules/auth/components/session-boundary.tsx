'use client';
import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { useSession } from '../hooks/use-session';
import { Button } from '@/components/ui/button';
import { ThemeSelector } from '@/modules/theme/theme-selector';
import { safeReturnPath } from '../utils/return-path';
import { Alert } from '@/components/ui/alert';

export function SessionBoundary({
  children,
  mode = 'protected',
}: {
  children?: ReactNode;
  mode?: 'protected' | 'guest' | 'entry';
}) {
  const { session, checking, changing } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const hasInitialUser = Boolean(session.data);
  const waiting =
    session.isPending ||
    (!hasInitialUser && (checking || session.isFetching)) ||
    (changing && (mode !== 'guest' || Boolean(session.data)));
  const authenticated = Boolean(session.data);
  const redirect =
    !waiting &&
    !session.isError &&
    (mode === 'entry' || (mode === 'guest' ? authenticated : !authenticated));
  useEffect(() => {
    if (!redirect) return;
    if (authenticated)
      router.replace(
        safeReturnPath(
          new URLSearchParams(window.location.search).get('returnTo'),
        ),
      );
    else
      router.replace(
        mode === 'protected'
          ? `/login?returnTo=${encodeURIComponent(pathname + window.location.search)}`
          : '/login',
      );
  }, [redirect, authenticated, mode, pathname, router]);
  if (mode === 'guest' && !redirect && !session.data)
    return (
      <>
        {session.isError && (
          <Alert className="mb-6 space-y-3">
            <h2 className="font-semibold">Unable to load your session</h2>
            <p>
              Check your connection or try again when the service is available.
            </p>
            <Button
              variant="outline"
              disabled={session.isFetching}
              onClick={() => {
                void session.refetch();
              }}
            >
              Try again
            </Button>
          </Alert>
        )}
        {children}
      </>
    );
  if (waiting || redirect)
    return (
      <div className="grid min-h-48 place-items-center">
        <p
          role="status"
          className="flex items-center gap-3 text-muted-foreground"
        >
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          Checking your session…
        </p>
      </div>
    );
  if (session.isError)
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md space-y-5">
          <ThemeSelector />
          <h1 className="text-2xl font-semibold">
            Unable to load your session
          </h1>
          <p className="text-muted-foreground">
            Check your connection or try again when the service is available.
          </p>
          <Button
            onClick={() => {
              void session.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      </main>
    );
  return children;
}
