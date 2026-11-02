import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { Loading } from "../components/ui.jsx";

export default function Login() {
  const { user, ready, login } = useAuth();
  const loc = useLocation();
  const [form, setForm] = useState({ login: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <Loading />;
  if (user) return <Navigate to={loc.state?.from || "/"} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form.login.trim(), form.password);
    } catch (err) {
      setError(
        err.status === 429 ? "Too many attempts. Wait a minute, then try again."
        : err.status === 401 ? "That username/email or password is incorrect."
        : err.message
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="panel" onSubmit={submit} noValidate>
        <h1>Sign in to FieldDesk</h1>
        {error && <div className="banner error" role="alert">{error}</div>}
        <label>Username or email
          <input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} autoComplete="username" required />
        </label>
        <label>Password
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" required />
        </label>
        <button className="primary" disabled={busy || !form.login || !form.password}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="muted small">Demo accounts: owner@acme.test, dispatcher@acme.test, tech1@acme.test (and the same for borealis.test). See README for the password.</p>
      </form>
    </div>
  );
}
