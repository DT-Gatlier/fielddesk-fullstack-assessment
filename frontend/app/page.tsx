import Link from "next/link";

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
      <div className="landing-page__inner">
        <section className="landing-hero">
          <span className="landing-hero__eyebrow">Gatlier Assessment</span>
          <h1>FieldDesk</h1>
          <p>
            Coordinate field technicians, schedule work orders, track progress, and
            keep every organisation&apos;s data securely isolated.
          </p>
          <div className="landing-links">
            <Link href="/login" className="btn btn--primary">
              Sign in
            </Link>
            <Link href="/dashboard" className="btn btn--secondary">
              Open dashboard
            </Link>
          </div>
        </section>

        <div className="card status-panel">
          <h2>API status</h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.92rem" }}>
            Backend URL: <code>{apiUrl}</code>
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
              <p style={{ color: "var(--color-text-muted)" }}>
                Start the stack with <code>npm run dev</code> from the repo root.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
