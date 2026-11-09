import { useNavigate } from "react-router-dom"
import { ROUTE_CONFIG } from "@/app/router/config"
import { Button } from "@/app/shared/widgets/base/button"

function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center">
        <div className="mb-6">
          <h1 className="mb-2 text-7xl font-bold text-emerald-600 md:text-8xl">
            404
          </h1>
          <div className="mx-auto mb-6 h-1 w-16 bg-emerald-500"></div>
        </div>

        <h2 className="mb-3 text-2xl font-bold text-slate-900 md:text-3xl">
          Page Not Found
        </h2>
        <p className="mb-8 text-sm text-slate-600">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
          >
            Go Back
          </Button>
          <Button
            onClick={() => navigate(ROUTE_CONFIG.dashboard.path)}
            variant="default"
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}

export default NotFound
