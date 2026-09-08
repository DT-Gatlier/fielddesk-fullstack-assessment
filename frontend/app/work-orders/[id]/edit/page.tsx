"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getMe, getWorkOrder, updateWorkOrder } from "@/lib/api";

export default function EditWorkOrderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
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
        const detail = await getWorkOrder(params.id);
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

  if (loading) return <main><p>Loading…</p></main>;

  return (
    <main>
      <header className="page-header">
        <h1>Edit work order</h1>
        <Link href={`/work-orders/${params.id}`}>Cancel</Link>
      </header>

      <form className="card form" onSubmit={(e) => void handleSubmit(e)}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
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
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} required />
        </label>
        {error ? <p className="status-error">{error}</p> : null}
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </main>
  );
}
