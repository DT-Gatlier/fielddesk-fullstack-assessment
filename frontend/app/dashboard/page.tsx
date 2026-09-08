"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe, logout, type AuthUser } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMe()
      .then((result) => {
        if (!result) {
          router.replace("/login");
          return;
        }
        setUser(result.user);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load session");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <main>
        <p>Loading session…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main>
        <p className="status-error">{error}</p>
        <Link href="/login">Back to login</Link>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Signed in as {user.email}</p>

      <div className="card">
        <h2>Your session</h2>
        <dl className="details">
          <div>
            <dt>Role</dt>
            <dd>{user.role}</dd>
          </div>
          <div>
            <dt>Organisation ID</dt>
            <dd><code>{user.organisationId}</code></dd>
          </div>
          <div>
            <dt>User ID</dt>
            <dd><code>{user.id}</code></dd>
          </div>
        </dl>
        <button type="button" onClick={() => void handleLogout()}>
          Sign out
        </button>
      </div>
    </main>
  );
}
