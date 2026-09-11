"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Alert } from "@/components/Alert";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PageHeader } from "@/components/PageHeader";
import { getMe, getWorkOrder, updateWorkOrder, type AuthUser } from "@/lib/api";

export default function EditWorkOrderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [siteName, setSiteName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMe()
      .then(async (me) => {
        if (!me) {
          router.replace("/login");
          return;
        }
        if (me.user.role === "technician") {
          router.replace(`/work-orders/${params.id}`);
          return;
        }
        setUser(me.user);

        const detail = await getWorkOrder(params.id);
        setReferenceNumber(detail.workOrder.referenceNumber);
        setTitle(detail.workOrder.title);
        setDescription(detail.workOrder.description);
        setPriority(detail.workOrder.priority);
        setSiteName(detail.workOrder.siteName);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [params.id, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateWorkOrder(params.id, { title, description, priority, siteName });
      router.push(`/work-orders/${params.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="app-main">
        <LoadingScreen message="Loading work order…" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="public-page">
        <div className="public-page__inner">
          <Alert variant="error">{error ?? "Unable to edit this work order"}</Alert>
          <Link href="/work-orders" className="btn btn--secondary">
            Back to list
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AppShell user={user}>
      <PageHeader
        breadcrumbs={[
          { label: "Work orders", href: "/work-orders" },
          { label: referenceNumber, href: `/work-orders/${params.id}` },
          { label: "Edit" },
        ]}
        title="Edit work order"
        description="Update the core details for this work order."
        actions={
          <Link href={`/work-orders/${params.id}`} className="btn btn--secondary">
            Cancel
          </Link>
        }
      />

      <form className="form" onSubmit={(e) => void handleSubmit(e)} style={{ maxWidth: "640px" }}>
        <div className="form-section">
          <div className="form-section__title">Job details</div>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </label>
        </div>

        <div className="form-section">
          <div className="form-section__title">Location & priority</div>
          <label>
            Site name
            <input value={siteName} onChange={(e) => setSiteName(e.target.value)} required />
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
            {saving ? "Saving…" : "Save changes"}
          </button>
          <Link href={`/work-orders/${params.id}`} className="btn btn--secondary">
            Cancel
          </Link>
        </div>
      </form>
    </AppShell>
  );
}
