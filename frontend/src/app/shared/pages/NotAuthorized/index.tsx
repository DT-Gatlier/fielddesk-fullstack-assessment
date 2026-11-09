import { useNavigate } from "react-router-dom"
import { ROUTE_CONFIG } from "@/app/router/config"
import { Button } from "@/app/shared/widgets/base/button"

function NotAuthorized() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center">
        {/* 403 Heading */}
        <div className="mb-6">
          <h1 className="mb-2 text-7xl font-bold text-emerald-600 md:text-8xl">
            403
          </h1>
          <div className="mx-auto mb-6 h-1 w-16 bg-emerald-500"></div>
        </div>

        {/* Message */}
        <h2 className="mb-3 text-2xl font-bold text-slate-900 md:text-3xl">
          Not Authorized
        </h2>
        <p className="mb-8 text-base text-slate-600 md:text-lg">
          You do not have permission to access this page. Please contact your
          administrator if you believe this is an error.
        </p>

        {/* Navigation Buttons */}
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            className="px-6"
          >
            Go Back
          </Button>
          <Button
            onClick={() => navigate(ROUTE_CONFIG.dashboard.path)}
            variant="default"
            className="px-6"
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}

export default NotAuthorized
