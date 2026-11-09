import { useNavigate, useRouteError } from "react-router-dom"
import { ROUTE_CONFIG } from "@/app/router/config"
import { Button } from "@/components/ui/Button"

function ErrorBoundary() {
  const error = useRouteError() as Error
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center">
        <div className="mb-6">
          <div className="mb-4 text-6xl">⚠️</div>
          <div className="mx-auto mb-6 h-1 w-16 bg-rose-500"></div>
        </div>

        <h1 className="mb-3 text-2xl font-bold text-slate-900 md:text-3xl">
          Something went wrong
        </h1>
        <p className="mb-6 text-sm text-slate-600">{error?.message || "An unexpected error occurred."}</p>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => navigate(ROUTE_CONFIG.dashboard.path)}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ErrorBoundary

