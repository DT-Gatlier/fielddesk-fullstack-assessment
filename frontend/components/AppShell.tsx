"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconClose,
  IconDashboard,
  IconLogout,
  IconMenu,
  IconPlus,
  IconWorkOrders,
} from "@/components/Icons";
import { logout, type AuthUser } from "@/lib/api";
import { formatRole } from "@/lib/format";

type AppShellProps = {
  user: AuthUser;
  children: ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  matchPrefix?: boolean;
};

const OPERATIONS_NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Operations",
    icon: <IconDashboard size={18} />,
  },
  {
    href: "/work-orders",
    label: "Work orders",
    icon: <IconWorkOrders size={18} />,
    matchPrefix: true,
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/work-orders/new") {
    return pathname === item.href;
  }
  if (item.matchPrefix) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
}

export function AppShell({ user, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const canCreate = user.role === "owner" || user.role === "dispatcher";

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  const userInitial = user.email.charAt(0).toUpperCase();

  return (
    <div className={`app-shell${sidebarOpen ? " app-shell--sidebar-open" : ""}`}>
      {sidebarOpen ? (
        <button
          type="button"
          className="app-shell__backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside className="app-sidebar" aria-label="Application navigation">
        <div className="app-sidebar__header">
          <Link href="/dashboard" className="app-sidebar__brand">
            <span className="app-sidebar__logo-mark">FD</span>
            <span className="app-sidebar__brand-text">
              <span className="app-sidebar__brand-name">FieldDesk</span>
              <span className="app-sidebar__brand-tag">Field operations</span>
            </span>
          </Link>
          <button
            type="button"
            className="app-sidebar__close btn btn--icon"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <IconClose />
          </button>
        </div>

        <nav className="app-sidebar__nav">
          <span className="app-sidebar__group-label">Operations</span>
          <ul className="app-sidebar__list">
            {OPERATIONS_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    isActive(pathname, item)
                      ? "app-sidebar__link app-sidebar__link--active"
                      : "app-sidebar__link"
                  }
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>

          {canCreate ? (
            <>
              <span className="app-sidebar__group-label">Quick action</span>
              <ul className="app-sidebar__list">
                <li>
                  <Link
                    href="/work-orders/new"
                    className={
                      pathname === "/work-orders/new"
                        ? "app-sidebar__link app-sidebar__link--active app-sidebar__link--accent"
                        : "app-sidebar__link app-sidebar__link--accent"
                    }
                  >
                    <IconPlus size={18} />
                    <span>New work order</span>
                  </Link>
                </li>
              </ul>
            </>
          ) : null}
        </nav>

        <div className="app-sidebar__footer">
          <div className="app-sidebar__user">
            <span className="app-sidebar__avatar" aria-hidden>
              {userInitial}
            </span>
            <div className="app-sidebar__user-meta">
              <span className="app-sidebar__email">{user.email}</span>
              <span className="app-sidebar__role">{formatRole(user.role)}</span>
            </div>
          </div>
          <button
            type="button"
            className="app-sidebar__logout btn btn--ghost btn--sm"
            onClick={() => void handleLogout()}
          >
            <IconLogout size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="app-shell__main">
        <header className="app-topbar">
          <button
            type="button"
            className="app-topbar__menu btn btn--icon"
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <IconMenu />
          </button>
          <div className="app-topbar__context">
            <span className="app-topbar__org">Your organisation</span>
            <span className="app-topbar__role">{formatRole(user.role)}</span>
          </div>
          <div className="app-topbar__user">
            <span className="app-topbar__avatar" aria-hidden>
              {userInitial}
            </span>
            <span className="app-topbar__email">{user.email}</span>
          </div>
        </header>

        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
