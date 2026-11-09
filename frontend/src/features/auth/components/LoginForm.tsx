import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Alert } from '../../../components/ui/Alert';
import { ShieldCheck, Sparkles, Building2, User, KeyRound } from 'lucide-react';

interface DemoUser {
  label: string;
  org: string;
  email: string;
  role: string;
  color: 'emerald' | 'blue' | 'purple';
}

const DEMO_ACCOUNTS: DemoUser[] = [
  {
    label: 'Apex Dispatcher',
    org: 'Apex Facilities',
    email: 'dispatcher@apex.test',
    role: 'DISPATCHER',
    color: 'emerald',
  },
  {
    label: 'Apex Technician',
    org: 'Apex Facilities',
    email: 'technician@apex.test',
    role: 'TECHNICIAN',
    color: 'blue',
  },
  {
    label: 'Summit Owner',
    org: 'Summit Maintenance',
    email: 'owner@summit.test',
    role: 'OWNER',
    color: 'purple',
  },
];

export const LoginForm: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  useEffect(() => {
    if (window.location.search.includes('session_expired=true')) {
      setIsSessionExpired(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Failed to log in. Please check your credentials.';
      setError(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickFill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setError(null);
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-500/20">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign in to FieldDesk</h1>
        <p className="text-sm text-slate-500">Multi-tenant field service management platform</p>
      </div>

      {/* Session Expired Notice */}
      {isSessionExpired && (
        <Alert variant="warning" title="Session Expired">
          Your session has ended or was revoked. Please log in again.
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="danger" title="Authentication Error">
          {error}
        </Alert>
      )}

      {/* Quick-Fill Demo Switcher */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Quick-Fill Demo Switcher</span>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              type="button"
              onClick={() => handleQuickFill(acc.email)}
              className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white hover:border-emerald-500 hover:bg-emerald-50/30 transition-all text-left group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-700 transition-colors">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900">{acc.label}</div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    <span>{acc.org}</span>
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-800">
                {acc.role}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Login Card */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. dispatcher@apex.test"
            required
            autoComplete="email"
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            autoComplete="current-password"
          />

          <Button type="submit" variant="primary" className="w-full mt-2" isLoading={isSubmitting}>
            <KeyRound className="w-4 h-4 mr-2" />
            Sign In
          </Button>
        </form>
      </div>

      <div className="text-center text-xs text-slate-400">
        Default password for all seeded accounts is <code className="font-mono text-slate-600">password123</code>
      </div>
    </div>
  );
};

