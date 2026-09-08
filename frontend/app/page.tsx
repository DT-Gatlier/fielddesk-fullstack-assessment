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
    <main>
      <h1>FieldDesk</h1>
      <p>Field-service work order platform — assessment build.</p>

      <div className="card">
        <h2>API status</h2>
        <p>
          Backend URL: <code>{apiUrl}</code>
        </p>
        {status.ok ? (
          <>
            <p className="status-ok">API is healthy and ready.</p>
            <pre>{JSON.stringify({ health: status.health, ready: status.ready }, null, 2)}</pre>
          </>
        ) : (
          <>
            <p className="status-error">
              API unreachable or not ready{status.error ? `: ${status.error}` : ""}.
            </p>
            <p>Start the stack with <code>npm run dev</code> from the repo root.</p>
          </>
        )}
      </div>
    </main>
  );
}
