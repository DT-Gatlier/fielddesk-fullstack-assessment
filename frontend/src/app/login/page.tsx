"use client";

import { useState, useEffect } from "react";
import { authApi } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const [organisations, setOrganisations] = useState<
    Array<{ id: string; name: string; slug: string }>
  >([]);
  const [organisationId, setOrganisationId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingOrgs, setFetchingOrgs] = useState(true);

  useEffect(() => {
    let isMounted = true;
    authApi
      .getOrganisations()
      .then((res) => {
        if (isMounted && res.organisations?.length) {
          setOrganisations(res.organisations);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setFetchingOrgs(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!organisationId) {
      showToast("Please select your organisation", "error");
      return;
    }

    if (!email || !password) {
      showToast("Please enter your email and password", "error");
      return;
    }

    setLoading(true);

    try {
      await authApi.login(email, password, organisationId);
      showToast("Signed in successfully. Redirecting...", "success");
      setTimeout(() => {
        router.push("/dashboard");
      }, 300);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Invalid credentials", "error");
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div className="brand-badge" style={{ marginBottom: "12px" }}>
            <span className="brand-badge-dot"></span>
            FieldDesk Platform
          </div>
          <h1
            style={{
              fontSize: "1.6rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
              marginBottom: "6px",
            }}
          >
            Operator Sign In
          </h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Select your organisation to access your tenant operations
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Organisation</label>
            <select
              className="form-input"
              value={organisationId}
              onChange={(e) => setOrganisationId(e.target.value)}
              disabled={fetchingOrgs || loading}
              required
            >
              <option value="" disabled>
                {fetchingOrgs ? "Loading organisations..." : "Select an organisation..."}
              </option>
              {organisations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@company.com"
              disabled={loading}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                className="form-input"
                style={{ width: "100%", paddingRight: "40px" }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                disabled={loading}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: "4px",
                }}
              >
                {showPassword ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || fetchingOrgs}
            style={{ marginTop: "16px" }}
          >
            {loading ? "Authenticating..." : "Sign In to Operations"}
          </button>
        </form>

        <div
          style={{
            marginTop: "24px",
            paddingTop: "16px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
          }}
        >
          <span>End-to-end encrypted tenant isolation</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent)" }}></span>
            Protected
          </span>
        </div>
      </div>
    </div>
  );
}
