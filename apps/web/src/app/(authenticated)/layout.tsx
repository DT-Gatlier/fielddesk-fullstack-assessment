import type { ReactNode } from 'react';
import { SessionBoundary } from '@/modules/auth/components/session-boundary';
import { ApplicationShell } from '@/modules/layout/application-shell';
import { NavigationProgressBar } from '@/components/navigation-progress';

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SessionBoundary>
      <NavigationProgressBar>
        <ApplicationShell>{children}</ApplicationShell>
      </NavigationProgressBar>
    </SessionBoundary>
  );
}
