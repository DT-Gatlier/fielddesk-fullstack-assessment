interface ConfigErrorProps {
  error: Error
}

function ConfigError({ error }: ConfigErrorProps) {
  const isDev = import.meta.env.DEV

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center">
        <div className="mb-6">
          <div className="mb-4 text-6xl">⚙️</div>
          <div className="mx-auto mb-6 h-1 w-16 bg-rose-500"></div>
        </div>

        <h1 className="mb-3 text-2xl font-bold text-slate-900 md:text-3xl">
          Application Misconfiguration
        </h1>

        <p className="mb-6 text-sm text-slate-600">
          The application cannot start due to invalid environment configuration.
        </p>

        {isDev && (
          <div className="mb-6 rounded-lg bg-rose-50 border border-rose-200 p-4 text-left">
            <p className="mb-2 text-xs font-semibold text-rose-700">
              Details:
            </p>
            <pre className="overflow-auto text-xs text-rose-600">
              {error?.message}
            </pre>
          </div>
        )}

        <p className="text-xs text-slate-400">
          Please contact support or check your environment variables.
        </p>
      </div>
    </div>
  )
}

export default ConfigError

