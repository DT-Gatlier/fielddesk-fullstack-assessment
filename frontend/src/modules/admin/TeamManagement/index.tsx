import { useGetProfileDetails } from "@/app/api/queryHooks"
import { useTechnicians } from "@/modules/Common/WorkOrders/queryHooks"
import { Button } from "@/app/shared/widgets/base/button"
import { StatusBadge } from "@/app/shared/widgets/custom/StatusBadge"
import { Users, UserPlus, Mail, Shield, Loader2 } from "lucide-react"

function TeamManagement() {
  const { data: userInfo } = useGetProfileDetails()
  const { data: technicians = [], isLoading: isTechLoading } = useTechnicians()
  const user = userInfo?.user

  // Live team members derived from active session and organization roster
  const teamMembers = [
    ...(user
      ? [
          {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: "Active",
          },
        ]
      : []),
    ...technicians
      .filter((t) => t.id !== user?.id)
      .map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
        role: "technician",
        status: "Active",
      })),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Technician &amp; Team Roster</h1>
          <p className="text-sm text-slate-500">
            Organization: <strong className="text-slate-700">{user?.organisationName}</strong> • Active Team Members
          </p>
        </div>

        <Button variant="default">
          <UserPlus className="h-4 w-4 mr-1.5" />
          <span>Invite Member</span>
        </Button>
      </div>

      {isTechLoading ? (
        <div className="flex items-center justify-center p-12 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-sm">Loading team roster...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {teamMembers.map((member) => (
            <div key={member.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                  <Users className="h-5 w-5" />
                </div>
                <StatusBadge status={member.role} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{member.name}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" />
                  <span>{member.email}</span>
                </p>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <Shield className="h-3 w-3" />
                  <span>Verified</span>
                </span>
                <span>{member.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default TeamManagement
