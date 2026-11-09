import React from 'react';
import { useAuth } from '../features/auth/hooks/useAuth';
import { LoginForm } from '../features/auth/components/LoginForm';
import { AppShell } from '../components/layout/AppShell';
import { Badge } from '../components/ui/Badge';
import { ShieldCheck, UserCheck, Building2, CheckCircle2, Lock, ArrowRight } from 'lucide-react';

export const App: React.FC = () => {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-500">Validating tenant session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50/80 p-4">
        <LoginForm />
      </div>
    );
  }

  const roleColors: Record<string, 'emerald' | 'blue' | 'purple'> = {
    owner: 'purple',
    dispatcher: 'emerald',
    technician: 'blue',
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Welcome Banner */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Welcome, {user.name}</h2>
              <Badge variant={roleColors[user.role] || 'emerald'}>
                {user.role}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">
              Authenticated into <strong className="text-slate-800">{user.organisationName}</strong> with full zero-trust role isolation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>JWT Session Active (15m TTL)</span>
            </span>
          </div>
        </div>

        {/* Feature 01 Verification Overview Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
              <Building2 className="w-4 h-4 text-emerald-600" />
              <span>Organisation Isolation</span>
            </div>
            <div className="text-2xl font-bold text-slate-900">{user.organisationId}</div>
            <p className="text-xs text-slate-500 leading-relaxed">
              All repository queries strictly scoped by <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">organisation_id</code>.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
              <UserCheck className="w-4 h-4 text-sky-600" />
              <span>Assigned Identity</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 capitalize">{user.role}</div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Role derived strictly from server-side verified cryptographic claims.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
              <Lock className="w-4 h-4 text-purple-600" />
              <span>Revocation Guard</span>
            </div>
            <div className="text-2xl font-bold text-slate-900">Redis TTL</div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Revoked tokens (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">jti</code>) blacklisted with automatic expiration.
            </p>
          </div>
        </div>

        {/* Multi-Tenant Security Guard Card */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl p-6 shadow-md space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Multi-Tenant Invariants Enforced</span>
          </div>
          <h3 className="text-lg font-semibold text-white">Zero-Trust Multi-Tenancy Architecture</h3>
          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
            The frontend is an untrusted presentation client. The backend never accepts client-supplied organisation identifiers in headers or bodies. All database operations strictly bind the verified tenant context. Cross-tenant tampering yields <code className="font-mono bg-slate-800 text-emerald-300 px-1.5 py-0.5 rounded border border-slate-700">404 Not Found</code> to prevent existence enumeration.
          </p>
          <div className="pt-2 flex items-center gap-2 text-xs text-slate-400">
            <span>Feature 01: Authentication, RBAC & Isolation Complete</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default App;

