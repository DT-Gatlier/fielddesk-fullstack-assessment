"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getDashboardSummary,
  getMe,
  logout,
  type AuthUser,
  type DashboardSummary,
} from "@/lib/api";
import { connectRealtime } from "@/lib/realtime";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMe(), getDashboardSummary()])
      .then(([meResult, summaryResult]) => {
        if (!meResult) {
          router.replace("/login");
          return;
        }
        setUser(meResult.user);
        setSummary(summaryResult.summary);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const refreshSummary = () => {
      void getDashboardSummary()
        .then((result) => setSummary(result.summary))
        .catch(() => {
          // Real-time is best-effort; page still works without it.
        });
    };

    return connectRealtime(() => refreshSummary(), refreshSummary);
  }, [user]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return <main><p>Loading dashboard…</p></main>;
  }

  if (error || !user) {
    return (
      <main>
        <p className="status-error">{error ?? "Not signed in"}</p>
        <Link href="/login">Back to login</Link>
      </main>
    );
  }

  return (
    <main>
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Signed in as {user.email} ({user.role})</p>
        </div>
        <nav className="nav-links">
          <Link href="/work-orders">Work orders</Link>
          <button type="button" onClick={() => void handleLogout()}>Sign out</button>
        </nav>
      </header>

      {summary ? (
        <div className="card-grid">
          <div className="card stat-card">
            <h2>Total</h2>
            <p className="stat-value">{summary.total}</p>
          </div>
          {Object.entries(summary.byStatus).map(([status, count]) => (
            <div className="card stat-card" key={status}>
              <h2>{status.replace("_", " ")}</h2>
              <p className="stat-value">{count}</p>
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}
