"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Alert } from "@/components/Alert";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PageHeader } from "@/components/PageHeader";
import {
  getDashboardSummary,
  getMe,
  type AuthUser,
  type DashboardSummary,
} from "@/lib/api";
import { formatStatus } from "@/lib/format";
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

    return connectRealtime(refreshSummary, refreshSummary);
  }, [user]);

  if (loading) {
    return (
      <div className="app-main">
        <LoadingScreen message="Loading dashboard…" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="public-page">
        <div className="public-page__inner">
          <Alert variant="error">{error ?? "Not signed in"}</Alert>
          <Link href="/login" className="btn btn--primary">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="Dashboard"
        description={
          user.role === "technician"
            ? "Overview of work orders assigned to you."
            : "Live summary of work orders in your organisation."
        }
        actions={
          <Link href="/work-orders" className="btn btn--secondary">
            View all orders
          </Link>
        }
      />

      {summary ? (
        <div className="card-grid">
          <div className="card stat-card stat-card--total">
            <h2>Total</h2>
            <p className="stat-value">{summary.total}</p>
          </div>
          {Object.entries(summary.byStatus).map(([status, count]) => (
            <div className="card stat-card" key={status}>
              <h2>{formatStatus(status)}</h2>
              <p className="stat-value">{count}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card card--section">
        <div className="card__title">
          <h2>Quick actions</h2>
        </div>
        <div className="action-row">
          <Link href="/work-orders" className="btn btn--primary">
            Browse work orders
          </Link>
          {user.role === "owner" || user.role === "dispatcher" ? (
            <Link href="/work-orders/new" className="btn btn--secondary">
              Create work order
            </Link>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
