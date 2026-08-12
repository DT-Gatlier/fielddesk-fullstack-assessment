import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Button, TextInput } from '../components/FormControls';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ organisation: 'northwind', email: 'owner@northwind.test', password: 'FieldDesk123!' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await login(values);
      const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';
      navigate(destination, { replace: true });
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not sign in. Please try again.'); }
    finally { setBusy(false); }
  }

  return <main className="login-page">
    <section className="login-aside"><div className="brand brand--light"><span className="brand__mark">F</span><span>FieldDesk</span></div><div><p className="eyebrow">Field operations, in focus</p><h1>Keep every job moving.</h1><p>Plan work, coordinate teams, and keep your customers informed from one calm workspace.</p></div><small>Secure multi-tenant field service management</small></section>
    <section className="login-panel"><form className="login-card" onSubmit={submit}><div><p className="eyebrow">Welcome back</p><h2>Sign in to FieldDesk</h2><p>Use your organisation slug and account details.</p></div>
      {error && <div className="form-alert" role="alert">{error}</div>}
      <TextInput label="Organisation" value={values.organisation} autoComplete="organization" required onChange={(event) => setValues({ ...values, organisation: event.target.value })} />
      <TextInput label="Email address" type="email" value={values.email} autoComplete="email" required onChange={(event) => setValues({ ...values, email: event.target.value })} />
      <TextInput label="Password" type="password" value={values.password} autoComplete="current-password" required minLength={8} onChange={(event) => setValues({ ...values, password: event.target.value })} />
      <Button type="submit" busy={busy}>Sign in</Button>
      <p className="demo-note">Demo credentials are pre-filled for local review.</p>
    </form></section>
  </main>;
}
