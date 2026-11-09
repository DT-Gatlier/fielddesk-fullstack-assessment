import { useNavigate } from "react-router-dom"
import { ROUTE_CONFIG } from "@/app/router/config"
import { Button } from "@/components/ui/Button"
import { ShieldAlert } from "lucide-react"

function NotAuthorized() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-8 ring-rose-50/50">
            <ShieldAlert className="h-8 w-8" />
          </div>
        </div>

        <h1 className="mb-2 text-2xl font-bold text-slate-900">
          Access Restricted (403)
        </h1>
        <p className="mb-6 text-sm text-slate-600">
          Your current role does not have authorization to view this resource. Contact your tenant administrator to request elevated permissions.
        </p>

        <div className="flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
          >
            Go Back
          </Button>
          <Button
            variant="primary"
            onClick={() => navigate(ROUTE_CONFIG.dashboard.path)}
          >
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}

export default NotAuthorized

