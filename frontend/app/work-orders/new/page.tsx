"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createWorkOrder, getMe } from "@/lib/api";

export default function NewWorkOrderPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [siteName, setSiteName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getMe().then((me) => {
      if (!me) router.replace("/login");
      else if (me.user.role === "technician") router.replace("/work-orders");
    });
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await createWorkOrder({ title, description, priority, siteName });
      router.push(`/work-orders/${result.workOrder.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create work order");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <header className="page-header">
        <h1>New work order</h1>
        <Link href="/work-orders">Back to list</Link>
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
        <button type="submit" disabled={loading}>
          {loading ? "Creating…" : "Create work order"}
        </button>
      </form>
    </main>
  );
}
