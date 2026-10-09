'use client';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Briefcase,
  LayoutDashboard,
  LogOut,
  Moon,
  MoreVertical,
  Settings,
  Sun,
  Users,
  Wrench,
} from 'lucide-react';
import { NavLink } from '@/components/navigation-progress';
import { useSession } from '@/modules/auth/hooks/use-session';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/modules/auth/hooks/use-logout';
import { useRealtimeEvents } from '@/modules/realtime';
import { NotificationBell } from '@/modules/notifications';

export function ApplicationShell({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const logoutMutation = useLogout();
  useRealtimeEvents();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const user = session.data;
  if (!user) return null;

  async function signOut(): Promise<void> {
    try {
      await logoutMutation.mutateAsync();
      router.replace('/login');
    } catch {
      /* Keep the screen and present the mutation error. */
    }
  }

  const navItems = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      show: true,
      exact: true,
    },
    {
      label: user.role === 'TECHNICIAN' ? 'My Work Orders' : 'Work Orders',
      href: '/work-orders',
      icon: Briefcase,
      show: true,
      exact: false,
    },
    {
      label: 'Users',
      href: '/users',
      icon: Users,
      show: user.role === 'OWNER',
      exact: false,
    },
    {
      label: 'Settings',
      href: '/settings',
      icon: Settings,
      show: user.role === 'OWNER',
      exact: false,
    },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:block focus:p-3"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-card px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <NavLink
              href="/dashboard"
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <Wrench className="size-5 text-primary" aria-hidden="true" />
              FieldDesk
            </NavLink>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {user.organisation.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="User actions and preferences"
                  className="size-9 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <MoreVertical className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                <DropdownMenuLabel className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Theme
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm"
                  onSelect={() => setTheme('light')}
                >
                  <span className="flex items-center gap-2">
                    <Sun className="size-4" aria-hidden="true" />
                    Light
                  </span>
                  {theme === 'light' && (
                    <span className="text-xs text-primary font-medium">Active</span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm"
                  onSelect={() => setTheme('dark')}
                >
                  <span className="flex items-center gap-2">
                    <Moon className="size-4" aria-hidden="true" />
                    Dark
                  </span>
                  {theme === 'dark' && (
                    <span className="text-xs text-primary font-medium">Active</span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm"
                  onSelect={() => setTheme('system')}
                >
                  <span className="flex items-center gap-2">
                    <span className="size-4 flex items-center justify-center text-xs font-bold">⚙</span>
                    System
                  </span>
                  {theme === 'system' && (
                    <span className="text-xs text-primary font-medium">Active</span>
                  )}
                </DropdownMenuItem>

                <DropdownMenuSeparator className="my-1.5" />

                <DropdownMenuItem
                  disabled={logoutMutation.isPending}
                  onSelect={(e) => {
                    e.preventDefault();
                    void signOut();
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  <span>{logoutMutation.isPending ? 'Signing out…' : 'Sign out'}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8 md:grid-cols-[200px_1fr]">
        <aside className="hidden md:block">
          <nav aria-label="Main navigation" className="space-y-1">
            {navItems.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
          <div className="mt-5 rounded-lg border border-border bg-card p-4">
            <p className="break-words text-sm font-medium">{user.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
            </p>
          </div>
        </aside>
        <main id="main-content" className="min-w-0 pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Snackbar / Tab bar */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 pb-[env(safe-area-inset-bottom)] md:hidden shadow-lg"
      >
        <div className="flex h-16 items-center justify-around px-2">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <NavLink
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-1 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <div
                  className={`flex size-8 items-center justify-center rounded-full transition-colors ${
                    isActive ? 'bg-primary/10' : ''
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <span className="truncate max-w-[72px] text-[11px] leading-tight text-center">
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
