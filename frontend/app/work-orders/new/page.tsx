"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Alert } from "@/components/Alert";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PageHeader } from "@/components/PageHeader";
import { createWorkOrder, getMe, type AuthUser } from "@/lib/api";

export default function NewWorkOrderPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [siteName, setSiteName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMe()
      .then((me) => {
        if (!me) {
          router.replace("/login");
          return;
        }
        if (me.user.role === "technician") {
          router.replace("/work-orders");
          return;
        }
        setUser(me.user);
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await createWorkOrder({ title, description, priority, siteName });
      router.push(`/work-orders/${result.workOrder.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create work order");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="app-main">
        <LoadingScreen />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="New work order"
        description="Create a draft work order for your organisation."
        actions={
          <Link href="/work-orders" className="btn btn--secondary">
            Cancel
          </Link>
        }
      />

      <form className="card form" onSubmit={(e) => void handleSubmit(e)}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. HVAC maintenance" />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Describe the work required…"
          />
        </label>
        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label>
          Site name
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} required placeholder="e.g. Downtown Office" />
        </label>

        {error ? <Alert variant="error">{error}</Alert> : null}

        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Creating…" : "Create work order"}
          </button>
        </div>
      </form>
    </AppShell>
  );
}
