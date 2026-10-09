'use client';
import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
      closeButton
      offset="max(16px, env(safe-area-inset-bottom))"
      mobileOffset="max(16px, env(safe-area-inset-bottom))"
      toastOptions={{
        classNames: {
          toast: 'auth-toast',
          description: 'text-muted-foreground',
        },
      }}
    />
  );
}
