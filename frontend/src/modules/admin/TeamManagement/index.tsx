import { useGetProfileDetails } from "@/app/api/queryHooks"
import { Badge } from "@/components/ui/Badge"
import { Users, UserPlus, Mail, Shield } from "lucide-react"
import { Button } from "@/components/ui/Button"

function TeamManagement() {
  const { data: userInfo } = useGetProfileDetails()
  const user = userInfo?.user

  const teamMembers = [
    {
      id: "u1",
      name: user?.name || "Tenant Owner",
      email: user?.email || "owner@apex.test",
      role: user?.role || "owner",
      status: "Active",
    },
    {
      id: "u2",
      name: "Marcus Vance",
      email: "dispatcher@apex.test",
      role: "dispatcher",
      status: "Active",
    },
    {
      id: "u3",
      name: "Alex Rivers",
      email: "tech1@apex.test",
      role: "technician",
      status: "Active",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Technician & Team Roster</h1>
          <p className="text-sm text-slate-500">
            Tenant: <strong className="text-slate-700">{user?.organisationName}</strong> • Role-based access control
          </p>
        </div>

        <Button variant="primary">
          <UserPlus className="h-4 w-4 mr-1.5" />
          <span>Invite Member</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {teamMembers.map((member) => (
          <div key={member.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <Users className="h-5 w-5" />
              </div>
              <Badge variant={member.role === 'owner' ? 'purple' : member.role === 'dispatcher' ? 'emerald' : 'blue'}>
                {member.role}
              </Badge>
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
    </div>
  )
}

export default TeamManagement

