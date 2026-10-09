import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import '@fontsource-variable/inter';
import { Toaster } from '@/components/ui/sonner';
import { ReactQueryProvider } from '@/modules/react-query/react-query-provider';
import { ThemeProvider } from '@/modules/theme/theme-provider';
import { AuthProvider } from '@/modules/auth/components/auth-provider';

export const metadata: Metadata = {
  title: 'FieldDesk',
  description: 'Field-service scheduling and work-order management.',
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <ReactQueryProvider>
            <AuthProvider>{children}</AuthProvider>
          </ReactQueryProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
