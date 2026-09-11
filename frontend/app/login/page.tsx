"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Alert } from "@/components/Alert";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@acme.test");
  const [password, setPassword] = useState("FieldDesk2026!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="public-page">
      <div className="public-page__inner">
        <div className="landing-hero" style={{ marginBottom: "1.25rem" }}>
          <span className="landing-hero__eyebrow">Welcome back</span>
          <h1>Sign in to FieldDesk</h1>
          <p>Use a seeded assessment account to explore the platform.</p>
        </div>

        <form className="card auth-card form" onSubmit={handleSubmit}>
          <div className="auth-card__header">
            <h2>Account credentials</h2>
            <p>Assessment password is pre-filled for convenience.</p>
          </div>

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <Alert variant="error">{error}</Alert> : null}

          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <Link href="/" className="btn btn--secondary">
              Back to home
            </Link>
          </div>
        </form>

        <div className="auth-hint">
          Try <code>dispatcher@acme.test</code> or <code>tech@beta.test</code> with password{" "}
          <code>FieldDesk2026!</code>
        </div>
      </div>
    </div>
  );
}
