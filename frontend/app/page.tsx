import Link from "next/link";
import { IconWorkOrders } from "@/components/Icons";

const apiUrl =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

async function getApiStatus(): Promise<{
  ok: boolean;
  health?: unknown;
  ready?: unknown;
  error?: string;
}> {
  try {
    const [healthRes, readyRes] = await Promise.all([
      fetch(`${apiUrl}/health`, { cache: "no-store" }),
      fetch(`${apiUrl}/ready`, { cache: "no-store" }),
    ]);

    return {
      ok: healthRes.ok && readyRes.ok,
      health: await healthRes.json(),
      ready: await readyRes.json(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to reach API",
    };
  }
}

export default async function HomePage() {
  const status = await getApiStatus();

  return (
    <div className="landing-page">
      <section className="landing-page__hero">
        <div className="landing-page__hero-inner">
          <span className="landing-hero__eyebrow">Field operations platform</span>
          <h1>FieldDesk</h1>
          <p>
            Schedule, assign, and track field-service work across your organisation.
            Built for dispatchers, technicians, and operations teams.
          </p>
          <div className="landing-links">
            <Link href="/login" className="btn btn--primary">
              Sign in
            </Link>
            <Link href="/dashboard" className="btn btn--secondary">
              Open dashboard
            </Link>
          </div>
          <ul className="landing-features">
            <li>
              <span className="landing-features__dot" aria-hidden />
              Work order lifecycle from draft to completion
            </li>
            <li>
              <span className="landing-features__dot" aria-hidden />
              Technician scheduling with conflict detection
            </li>
            <li>
              <span className="landing-features__dot" aria-hidden />
              Multi-tenant isolation and role-based access
            </li>
          </ul>
        </div>
      </section>

      <section className="landing-page__content">
        <div className="landing-page__content-inner">
          <div className="landing-hero landing-hero--light" style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>System status</h2>
            <p>Backend connectivity for local development.</p>
          </div>

          <div className="panel panel__body status-panel">
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem" }}>
              API endpoint: <code>{apiUrl}</code>
            </p>

            {status.ok ? (
              <>
                <p className="status-panel__indicator status-ok">
                  <span className="status-panel__dot" />
                  API is healthy and ready
                </p>
                <pre>{JSON.stringify({ health: status.health, ready: status.ready }, null, 2)}</pre>
              </>
            ) : (
              <>
                <p className="status-panel__indicator status-error">
                  <span className="status-panel__dot status-panel__dot--error" />
                  API unreachable or not ready
                  {status.error ? `: ${status.error}` : ""}
                </p>
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
                  Start the stack with <code>npm run dev</code> from the repo root.
                </p>
              </>
            )}
          </div>

          <div className="panel panel__body" style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <IconWorkOrders size={20} />
            <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
              Gatlier full-stack engineering assessment
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
