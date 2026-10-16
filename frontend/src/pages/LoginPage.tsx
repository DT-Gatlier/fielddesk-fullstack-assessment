import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth';
import { Icon, LogoMark, type IconName } from '../components/icons';
import { Button, Field, Input } from '../components/ui';

const HIGHLIGHTS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'calendar', title: 'Conflict-free scheduling', text: 'Technicians can never be double-booked.' },
  { icon: 'pulse', title: 'Live everywhere', text: 'Dashboards update the moment work changes.' },
  { icon: 'bell', title: 'Reliable notifications', text: 'Assignments reach the field, with retries.' },
];

export function LoginPage() {
  const { me, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'RATE_LIMITED'
          ? 'Too many sign-in attempts. Wait a few minutes and try again.'
          : err instanceof ApiError && err.status === 401
            ? 'That email and password combination is not recognised.'
            : err instanceof ApiError ? err.message : 'Sign-in failed. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-night p-12 text-night-text lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-action/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-signal/10 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          <LogoMark className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-tight text-white">FieldDesk</span>
        </div>
        <div className="relative mt-auto max-w-md">
          <p className="text-3xl leading-tight font-semibold tracking-tight text-white">
            Schedule, dispatch and track field work — in one calm place.
          </p>
          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-night-raised text-indigo-300 ring-1 ring-night-line">
                  <Icon name={h.icon} />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{h.title}</span>
                  <span className="text-sm">{h.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="auth-backdrop flex items-center justify-center px-4 py-12">
        <div className="rise-in w-full max-w-[400px]">
          <div className="flex items-center gap-3 lg:hidden">
            <LogoMark className="h-9 w-9" />
            <span className="text-lg font-semibold tracking-tight">FieldDesk</span>
          </div>
          <h1 className="mt-8 text-[26px] font-semibold tracking-tight lg:mt-0">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-soft">Sign in to schedule and track field work.</p>
          <form onSubmit={onSubmit} className="mt-7 space-y-5 rounded-2xl border border-line bg-panel p-6 shadow-lift" noValidate>
            <Field label="Email">
              {(id) => <Input id={id} type="email" autoComplete="username" placeholder="you@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <Field label="Password">
              {(id) => (
                <Input id={id} type="password" autoComplete="current-password" placeholder="••••••••••••" required value={password} onChange={(e) => setPassword(e.target.value)} />
              )}
            </Field>
            {error && (
              <p role="alert" className="rise-in flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-tint px-3 py-2.5 text-sm text-danger">
                <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" busy={busy} className="h-10 w-full" disabled={!email || !password}>
              Sign in
            </Button>
          </form>
          <p className="mt-5 text-center text-xs text-ink-faint">Demo accounts are listed in the README.</p>
        </div>
      </div>
    </div>
  );
}
