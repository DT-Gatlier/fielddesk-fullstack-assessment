"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout, type AuthUser } from "@/lib/api";
import { formatRole } from "@/lib/format";

type AppShellProps = {
  user: AuthUser;
  children: ReactNode;
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/work-orders", label: "Work orders" },
];

export function AppShell({ user, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const canCreate = user.role === "owner" || user.role === "dispatcher";

  async function handleLogout() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <Link href="/dashboard" className="app-header__logo">
            <span className="app-header__logo-mark">FD</span>
            <span>FieldDesk</span>
          </Link>
        </div>

        <nav className="app-header__nav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                pathname === item.href || pathname.startsWith(`${item.href}/`)
                  ? "app-header__link app-header__link--active"
                  : "app-header__link"
              }
            >
              {item.label}
            </Link>
          ))}
          {canCreate ? (
            <Link
              href="/work-orders/new"
              className={
                pathname === "/work-orders/new"
                  ? "app-header__link app-header__link--active"
                  : "app-header__link app-header__link--accent"
              }
            >
              + New order
            </Link>
          ) : null}
        </nav>

        <div className="app-header__user">
          <div className="app-header__user-meta">
            <span className="app-header__email">{user.email}</span>
            <span className="app-header__role">{formatRole(user.role)}</span>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void handleLogout()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="app-main">{children}</main>
    </div>
  );
}
