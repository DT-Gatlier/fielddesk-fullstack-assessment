"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthUser, WorkOrderItem, apiRequest } from "@/lib/api";

type EventItem = { id: string; eventId: string; type: string; occurredAt: string; payload: Record<string, unknown>; user?: { name: string; role: string } };
type AttachmentItem = { id: string; fileName: string; fileSize: number; mimeType: string; createdAt: string };

export default function WorkOrderDetailsPage({ id }: { id: string }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [order, setOrder] = useState<WorkOrderItem | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progressNote, setProgressNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [me, result, history, files] = await Promise.all([
        apiRequest<{ user: AuthUser }>("/api/auth/me"),
        apiRequest<{ workOrder: WorkOrderItem }>(`/api/work-orders/${id}`),
        apiRequest<{ events: EventItem[] }>(`/api/progress-events/${id}`),
        apiRequest<{ attachments: AttachmentItem[] }>(`/api/work-orders/${id}/attachments`),
      ]);
      setUser(me.user);
      setOrder(result.workOrder);
      setEvents(history.events);
      setAttachments(files.attachments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load work order");
      if (e instanceof Error && e.message.toLowerCase().includes("auth")) router.replace("/login");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      if (user?.role === "TECHNICIAN") {
        await apiRequest(`/api/progress-events`, { method: "POST", body: JSON.stringify({ eventId: crypto.randomUUID(), workOrderId: id, type: "status_changed", occurredAt: new Date().toISOString(), payload: { status: form.get("status") } }) });
      } else {
        const response = await apiRequest<{ workOrder: WorkOrderItem }>(`/api/work-orders/${id}`, {
          method: "PUT",
          body: JSON.stringify({ title: form.get("title"), description: form.get("description"), siteName: form.get("siteName"), priority: form.get("priority"), status: form.get("status") }),
        });
        setOrder(response.workOrder);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save work order");
    } finally {
      setSaving(false);
    }
  }

  async function submitProgressNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiRequest("/api/progress-events", { method: "POST", body: JSON.stringify({ eventId: crypto.randomUUID(), workOrderId: id, type: "note_added", occurredAt: new Date().toISOString(), payload: { note: progressNote } }) });
      setProgressNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit progress update");
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch(`/api/work-orders/${id}/attachments`, { method: "POST", credentials: "include", body: data });
    const result = await response.json();
    if (!response.ok) { setError(result.message || "Upload failed"); return; }
    form.reset();
    await load();
  }

  if (loading) return <main style={{ padding: 32 }}>Loading work order…</main>;
  if (!order) return <main style={{ padding: 32 }}><p role="alert">{error || "Work order not found"}</p><button onClick={() => router.push("/dashboard")}>Back to dashboard</button></main>;

  const canEdit = user?.role === "OWNER" || user?.role === "DISPATCHER";
  const canUpdateStatus = canEdit || (user?.role === "TECHNICIAN" && order.assignedTechnicianId === user.id);
  const inputStyle = { width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6, margin: "5px 0 14px" };

  return <main style={{ maxWidth: 920, margin: "32px auto", padding: 20 }}>
    <button onClick={() => router.push("/dashboard")}>← Dashboard</button>
    <h1>{order.referenceNumber}: {order.title}</h1>
    {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
      <form onSubmit={save} style={{ padding: 20, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2>Work order</h2>
        <label>Title<input name="title" defaultValue={order.title} readOnly={!canEdit} required minLength={2} style={inputStyle} /></label>
        <label>Description<textarea name="description" defaultValue={order.description} readOnly={!canEdit} required minLength={2} style={inputStyle} /></label>
        <label>Site<input name="siteName" defaultValue={order.siteName} readOnly={!canEdit} required minLength={2} style={inputStyle} /></label>
        <label>Priority<select name="priority" defaultValue={order.priority} disabled={!canEdit} style={inputStyle}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Status<select name="status" defaultValue={order.status} disabled={!canUpdateStatus} style={inputStyle}>{["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((x) => <option key={x}>{x}</option>)}</select></label>
        <p>Assigned technician: {order.assignedTechnician?.name || "Unassigned"}</p>
        {(canEdit || canUpdateStatus) && <button disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>}
      </form>
      <section style={{ padding: 20, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2>Attachments</h2>
        <ul>{attachments.map((file) => <li key={file.id}><a href={`/api/work-orders/${id}/attachments/${file.id}/download`}>{file.fileName}</a> · {(file.fileSize / 1024).toFixed(0)} KB</li>)}</ul>
        <form onSubmit={upload}><label>Add PDF or image<input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required style={inputStyle} /></label><button>Upload</button></form>
      </section>
    </section>
    <section style={{ marginTop: 24, padding: 20, border: "1px solid #ddd", borderRadius: 8 }}>
      <h2>Activity history</h2>
      {events.length === 0 ? <p>No progress events yet.</p> : <ol>{events.map((item) => <li key={item.id} style={{ marginBottom: 12 }}><strong>{item.type.replaceAll("_", " ")}</strong> · {item.user?.name || "User"} · {new Date(item.occurredAt).toLocaleString()}<div>{typeof item.payload.note === "string" ? item.payload.note : ""}{typeof item.payload.status === "string" ? ` Status: ${item.payload.status}` : ""}</div></li>)}</ol>}
      {user?.role === "TECHNICIAN" && order.assignedTechnicianId === user.id && <form onSubmit={submitProgressNote}><label>Add progress note<textarea value={progressNote} onChange={(e) => setProgressNote(e.target.value)} maxLength={2000} required style={inputStyle} /></label><button disabled={!progressNote.trim()}>Submit update</button></form>}
    </section>
  </main>;
}
