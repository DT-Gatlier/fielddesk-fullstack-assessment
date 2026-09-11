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
        breadcrumbs={[
          { label: "Work orders", href: "/work-orders" },
          { label: "New" },
        ]}
        title="New work order"
        description="Create a draft work order. Assign a technician and schedule after creation."
        actions={
          <Link href="/work-orders" className="btn btn--secondary">
            Cancel
          </Link>
        }
      />

      <form className="form" onSubmit={(e) => void handleSubmit(e)} style={{ maxWidth: "640px" }}>
        <div className="form-section">
          <div className="form-section__title">Job details</div>
          <label>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. HVAC maintenance — Building A"
            />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe the work required, access notes, and any equipment details…"
            />
          </label>
        </div>

        <div className="form-section">
          <div className="form-section__title">Location & priority</div>
          <label>
            Site name
            <input
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              required
              placeholder="e.g. Downtown Office — Floor 3"
            />
          </label>
          <label>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low — routine maintenance</option>
              <option value="medium">Medium — standard service</option>
              <option value="high">High — needs prompt attention</option>
              <option value="urgent">Urgent — critical / SLA breach</option>
            </select>
          </label>
        </div>

        {error ? <Alert variant="error">{error}</Alert> : null}

        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Creating…" : "Create work order"}
          </button>
          <Link href="/work-orders" className="btn btn--secondary">
            Cancel
          </Link>
        </div>
      </form>
    </AppShell>
  );
}
