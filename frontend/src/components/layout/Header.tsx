import React from 'react';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ShieldCheck, Building2, LogOut, UserCheck } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();

  if (!user) return null;

  const roleColors: Record<string, 'emerald' | 'blue' | 'purple' | 'slate'> = {
    owner: 'purple',
    dispatcher: 'emerald',
    technician: 'blue',
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur transition-all">
      {/* Left: Brand / Logo */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <span className="text-base font-bold tracking-tight text-slate-900">FieldDesk</span>
          <span className="ml-2 text-xs font-medium text-slate-400">v1.0</span>
        </div>
      </div>

      {/* Right: Tenant Context Info & Actions */}
      <div className="flex items-center gap-4">
        {/* Organisation Badge */}
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
          <Building2 className="h-3.5 w-3.5 text-slate-500" />
          <span className="font-semibold text-slate-900">{user.organisationName || user.organisationId}</span>
        </div>

        {/* Role Badge */}
        <Badge variant={roleColors[user.role] || 'slate'}>
          {user.role}
        </Badge>

        <div className="h-5 w-px bg-slate-200" />

        {/* User Profile Info */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-200">
            <UserCheck className="h-4 w-4" />
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-xs font-semibold text-slate-900 leading-tight">{user.name}</div>
            <div className="text-[11px] text-slate-500 leading-tight">{user.email}</div>
          </div>
        </div>

        {/* Logout Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          className="text-slate-600 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 ml-2"
        >
          <LogOut className="h-3.5 w-3.5 mr-1.5" />
          <span>Sign Out</span>
        </Button>
      </div>
    </header>
  );
};

