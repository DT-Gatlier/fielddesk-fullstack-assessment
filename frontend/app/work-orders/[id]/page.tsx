"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  assignWorkOrder,
  getMe,
  getWorkOrder,
  listOrgUsers,
  submitProgressEvent,
  listWorkOrderAttachments,
  uploadWorkOrderAttachment,
  downloadWorkOrderAttachment,
  ApiRequestError,
  type AuditEntry,
  type AuthUser,
  type WorkOrder,
  type WorkOrderAttachment,
} from "@/lib/api";

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [technicians, setTechnicians] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [technicianId, setTechnicianId] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [attachments, setAttachments] = useState<WorkOrderAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const canManage = user?.role === "owner" || user?.role === "dispatcher";

  useEffect(() => {
    async function load() {
      try {
        const me = await getMe();
        if (!me) {
          router.replace("/login");
          return;
        }
        setUser(me.user);

        const detail = await getWorkOrder(params.id);
        setWorkOrder(detail.workOrder);
        setActivity(detail.activity);

        const attachmentList = await listWorkOrderAttachments(params.id);
        setAttachments(attachmentList.attachments);

        if (me.user.role === "owner" || me.user.role === "dispatcher") {
          const users = await listOrgUsers();
          setTechnicians(users.users.filter((u) => u.role === "technician"));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load work order");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [params.id, router]);

  async function handleAssign(event: FormEvent) {
    event.preventDefault();
    if (!workOrder) return;
    try {
      const result = await assignWorkOrder(workOrder.id, {
        assignedTechnicianId: technicianId,
        scheduledStart: new Date(scheduledStart).toISOString(),
        scheduledEnd: new Date(scheduledEnd).toISOString(),
      });
      setWorkOrder(result.workOrder);
      const detail = await getWorkOrder(workOrder.id);
      setActivity(detail.activity);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "SCHEDULING_CONFLICT") {
        setError("Scheduling conflict: this technician is already assigned during that window.");
      } else {
        setError(err instanceof Error ? err.message : "Assignment failed");
      }
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workOrder) return;
    const input = event.currentTarget.elements.namedItem("file") as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const result = await uploadWorkOrderAttachment(workOrder.id, file);
      setAttachments((current) => [result.attachment, ...current]);
      input.value = "";
      const detail = await getWorkOrder(workOrder.id);
      setActivity(detail.activity);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "STORAGE_QUOTA_EXCEEDED") {
        setError("Storage quota exceeded for your organisation.");
      } else {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(attachment: WorkOrderAttachment) {
    try {
      await downloadWorkOrderAttachment(attachment.id, attachment.originalFilename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function handleStatusChange(status: "in_progress" | "completed") {
    if (!workOrder) return;
    try {
      const result = await submitProgressEvent({
        eventId: crypto.randomUUID(),
        workOrderId: workOrder.id,
        type: "status_changed",
        occurredAt: new Date().toISOString(),
        payload: {
          status,
          note: status === "in_progress" ? "Work started" : "Work completed",
        },
      });
      setWorkOrder(result.workOrder);
      const detail = await getWorkOrder(workOrder.id);
      setActivity(detail.activity);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    }
  }

  if (loading) return <main><p>Loading…</p></main>;
  if (error || !workOrder) {
    return (
      <main>
        <p className="status-error">{error ?? "Work order not found"}</p>
        <Link href="/work-orders">Back to list</Link>
      </main>
    );
  }

  return (
    <main>
      <header className="page-header">
        <div>
          <h1>{workOrder.referenceNumber}</h1>
          <p>{workOrder.title}</p>
        </div>
        <nav className="nav-links">
          <Link href="/work-orders">Back to list</Link>
          {canManage ? <Link href={`/work-orders/${workOrder.id}/edit`}>Edit</Link> : null}
        </nav>
      </header>

      <div className="card">
        <dl className="details">
          <div><dt>Status</dt><dd>{workOrder.status}</dd></div>
          <div><dt>Priority</dt><dd>{workOrder.priority}</dd></div>
          <div><dt>Site</dt><dd>{workOrder.siteName}</dd></div>
          <div><dt>Description</dt><dd>{workOrder.description || "—"}</dd></div>
          <div><dt>Scheduled</dt><dd>{workOrder.scheduledStart ?? "—"} → {workOrder.scheduledEnd ?? "—"}</dd></div>
        </dl>
      </div>

      {(canManage && workOrder.status === "draft") || user?.role === "technician" ? (
        <div className="card">
          <h2>Actions</h2>
          {canManage && workOrder.status === "draft" ? (
            <form className="form" onSubmit={(e) => void handleAssign(e)}>
              <label>
                Technician
                <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} required>
                  <option value="">Select technician</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>{tech.email}</option>
                  ))}
                </select>
              </label>
              <label>
                Start
                <input type="datetime-local" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} required />
              </label>
              <label>
                End
                <input type="datetime-local" value={scheduledEnd} onChange={(e) => setScheduledEnd(e.target.value)} required />
              </label>
              <button type="submit">Assign & schedule</button>
            </form>
          ) : null}
          {user?.role === "technician" ? (
            <div className="action-row">
              <button type="button" onClick={() => void handleStatusChange("in_progress")}>Start work</button>
              <button type="button" onClick={() => void handleStatusChange("completed")}>Mark completed</button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <h2>Attachments</h2>
        {canManage ? (
          <form className="form" onSubmit={(e) => void handleUpload(e)}>
            <label>
              Upload file (JPEG, PNG, or PDF)
              <input type="file" name="file" accept="image/jpeg,image/png,application/pdf" required />
            </label>
            <button type="submit" disabled={uploading}>
              {uploading ? "Uploading…" : "Upload attachment"}
            </button>
          </form>
        ) : null}
        {attachments.length === 0 ? (
          <p>No attachments yet.</p>
        ) : (
          <ul className="activity-list">
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                <button type="button" onClick={() => void handleDownload(attachment)}>
                  {attachment.originalFilename}
                </button>
                <span>{Math.round(attachment.sizeBytes / 1024)} KB</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Activity history</h2>
        {activity.length === 0 ? <p>No activity yet.</p> : (
          <ul className="activity-list">
            {activity.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.action}</strong>
                <span>{new Date(entry.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
