import { useGetProfileDetails } from "@/app/api/queryHooks"
import { Building2, Shield, Save } from "lucide-react"
import { Button } from "@/app/shared/widgets/base/button"
import { QuotaProgressBar } from "@/modules/Common/WorkOrders/components/QuotaProgressBar"

function TenantSettings() {
  const { data: userInfo } = useGetProfileDetails()
  const user = userInfo?.user

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tenant Settings</h1>
        <p className="text-sm text-slate-500">
          Organization ID: <code className="font-mono text-xs">{user?.organisationId}</code> • Elevated Owner Configuration
        </p>
      </div>

      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Organisation Name
            </label>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                defaultValue={user?.organisationName || ""}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Multi-Tenant Data Isolation Strategy
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-800">
                <Shield className="h-4 w-4 text-emerald-600" />
                <span>Zero-Trust Scoped Row Isolation</span>
              </div>
              <p>
                All database rows are cryptographically bound to <code className="font-mono">{user?.organisationId}</code>. No request parameter can override tenant scoping.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Organisation Storage Quota Limit
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <QuotaProgressBar />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Session Timeout Policy
            </label>
            <select
              defaultValue="15m"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            >
              <option value="15m">15 Minutes (Default security standard)</option>
              <option value="30m">30 Minutes</option>
              <option value="1h">1 Hour</option>
            </select>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <Button variant="default">
            <Save className="h-4 w-4 mr-1.5" />
            <span>Save Settings</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

export default TenantSettings
