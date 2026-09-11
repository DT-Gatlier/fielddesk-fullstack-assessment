"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PageHeader } from "@/components/PageHeader";
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
import { formatDateTime, formatFileSize } from "@/lib/format";

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [technicians, setTechnicians] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [technicianId, setTechnicianId] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [attachments, setAttachments] = useState<WorkOrderAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [assigning, setAssigning] = useState(false);

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
        setLoadError(err instanceof Error ? err.message : "Failed to load work order");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [params.id, router]);

  async function handleAssign(event: FormEvent) {
    event.preventDefault();
    if (!workOrder) return;
    setAssigning(true);
    setActionError(null);
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
        setActionError("Scheduling conflict: this technician is already assigned during that window.");
      } else {
        setActionError(err instanceof Error ? err.message : "Assignment failed");
      }
    } finally {
      setAssigning(false);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workOrder) return;
    const input = event.currentTarget.elements.namedItem("file") as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setUploading(true);
    setActionError(null);
    try {
      const result = await uploadWorkOrderAttachment(workOrder.id, file);
      setAttachments((current) => [result.attachment, ...current]);
      input.value = "";
      const detail = await getWorkOrder(workOrder.id);
      setActivity(detail.activity);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "STORAGE_QUOTA_EXCEEDED") {
        setActionError("Storage quota exceeded for your organisation.");
      } else {
        setActionError(err instanceof Error ? err.message : "Upload failed");
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(attachment: WorkOrderAttachment) {
    setActionError(null);
    try {
      await downloadWorkOrderAttachment(attachment.id, attachment.originalFilename);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function handleStatusChange(status: "in_progress" | "completed") {
    if (!workOrder) return;
    setActionError(null);
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
      setActionError(err instanceof Error ? err.message : "Status update failed");
    }
  }

  if (loading) {
    return (
      <div className="app-main">
        <LoadingScreen message="Loading work order…" />
      </div>
    );
  }

  if (loadError || !workOrder || !user) {
    return (
      <div className="public-page">
        <div className="public-page__inner">
          <Alert variant="error">{loadError ?? "Work order not found"}</Alert>
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
        title={workOrder.referenceNumber}
        description={workOrder.title}
        actions={
          <>
            <Link href="/work-orders" className="btn btn--secondary">
              Back to list
            </Link>
            {canManage ? (
              <Link href={`/work-orders/${workOrder.id}/edit`} className="btn btn--primary">
                Edit
              </Link>
            ) : null}
          </>
        }
      />

      {actionError ? (
        <Alert variant="error" title="Action failed" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}

      <div className="card">
        <div className="badges" style={{ marginBottom: "1rem" }}>
          <Badge value={workOrder.status} variant="status" />
          <Badge value={workOrder.priority} variant="priority" />
        </div>
        <dl className="details">
          <div>
            <dt>Site</dt>
            <dd>{workOrder.siteName}</dd>
          </div>
          <div>
            <dt>Scheduled start</dt>
            <dd>{formatDateTime(workOrder.scheduledStart)}</dd>
          </div>
          <div>
            <dt>Scheduled end</dt>
            <dd>{formatDateTime(workOrder.scheduledEnd)}</dd>
          </div>
          <div className="details__full">
            <dt>Description</dt>
            <dd>{workOrder.description || "—"}</dd>
          </div>
        </dl>
      </div>

      {(canManage && workOrder.status === "draft") || user.role === "technician" ? (
        <div className="card card--section">
          <div className="card__title">
            <h2>Actions</h2>
          </div>

          {canManage && workOrder.status === "draft" ? (
            <form className="form" onSubmit={(e) => void handleAssign(e)}>
              <label>
                Technician
                <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} required>
                  <option value="">Select technician</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.email}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Start
                <input
                  type="datetime-local"
                  value={scheduledStart}
                  onChange={(e) => setScheduledStart(e.target.value)}
                  required
                />
              </label>
              <label>
                End
                <input
                  type="datetime-local"
                  value={scheduledEnd}
                  onChange={(e) => setScheduledEnd(e.target.value)}
                  required
                />
              </label>
              <div className="form__actions">
                <button type="submit" className="btn btn--primary" disabled={assigning}>
                  {assigning ? "Assigning…" : "Assign & schedule"}
                </button>
              </div>
            </form>
          ) : null}

          {user.role === "technician" ? (
            <div className="action-row">
              <button type="button" className="btn btn--primary" onClick={() => void handleStatusChange("in_progress")}>
                Start work
              </button>
              <button type="button" className="btn btn--secondary" onClick={() => void handleStatusChange("completed")}>
                Mark completed
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card card--section">
        <div className="card__title">
          <h2>Attachments</h2>
        </div>

        {canManage ? (
          <form className="form" onSubmit={(e) => void handleUpload(e)}>
            <label>
              Upload file (JPEG, PNG, or PDF)
              <input type="file" name="file" accept="image/jpeg,image/png,application/pdf" required />
            </label>
            <div className="form__actions">
              <button type="submit" className="btn btn--primary" disabled={uploading}>
                {uploading ? "Uploading…" : "Upload attachment"}
              </button>
            </div>
          </form>
        ) : null}

        {attachments.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>No attachments yet.</p>
        ) : (
          <ul className="activity-list">
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                <button type="button" className="btn btn--link activity-list__action" onClick={() => void handleDownload(attachment)}>
                  {attachment.originalFilename}
                </button>
                <span className="activity-list__time">{formatFileSize(attachment.sizeBytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card card--section">
        <div className="card__title">
          <h2>Activity history</h2>
        </div>
        {activity.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>No activity yet.</p>
        ) : (
          <ul className="activity-list">
            {activity.map((entry) => (
              <li key={entry.id}>
                <span className="activity-list__action">{entry.action}</span>
                <span className="activity-list__time">{formatDateTime(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
