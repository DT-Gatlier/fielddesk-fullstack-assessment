"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { IconClock, IconLocation, IconPaperclip, IconUser } from "@/components/Icons";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { Timeline } from "@/components/Timeline";
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
import { formatDateTime, formatFileSize, formatScheduleWindow, isOverdue } from "@/lib/format";

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
  const [statusUpdating, setStatusUpdating] = useState(false);

  const canManage = user?.role === "owner" || user?.role === "dispatcher";

  const assignedTechnician = useMemo(() => {
    if (!workOrder?.assignedTechnicianId) return null;
    return technicians.find((t) => t.id === workOrder.assignedTechnicianId) ?? null;
  }, [workOrder, technicians]);

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

  async function refreshDetail(orderId: string) {
    const detail = await getWorkOrder(orderId);
    setWorkOrder(detail.workOrder);
    setActivity(detail.activity);
  }

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
      await refreshDetail(workOrder.id);
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
      await refreshDetail(workOrder.id);
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
    setStatusUpdating(true);
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
      await refreshDetail(workOrder.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setStatusUpdating(false);
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

  const showAssignForm = canManage && workOrder.status === "draft";
  const showTechnicianActions = user.role === "technician";

  return (
    <AppShell user={user}>
      <PageHeader
        breadcrumbs={[
          { label: "Work orders", href: "/work-orders" },
          { label: workOrder.referenceNumber },
        ]}
        title={workOrder.title}
        description={workOrder.siteName}
        actions={
          <>
            <Link href="/work-orders" className="btn btn--secondary">
              Back
            </Link>
            {canManage ? (
              <Link href={`/work-orders/${workOrder.id}/edit`} className="btn btn--primary">
                Edit details
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

      <div className="detail-layout">
        <div className="detail-main">
          <div className="panel">
            <div className="status-banner">
              <Badge value={workOrder.status} variant="status" />
              <Badge value={workOrder.priority} variant="priority" showDot={false} />
              {isOverdue(workOrder) ? <Badge value="overdue" variant="overdue" /> : null}
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
                {workOrder.referenceNumber}
              </span>
            </div>
            <div className="panel__body">
              <dl className="detail-meta">
                <div>
                  <dt>Site location</dt>
                  <dd style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <IconLocation size={16} />
                    {workOrder.siteName}
                  </dd>
                </div>
                <div>
                  <dt>Schedule window</dt>
                  <dd style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <IconClock size={16} />
                    {formatScheduleWindow(workOrder.scheduledStart, workOrder.scheduledEnd)}
                  </dd>
                </div>
                <div>
                  <dt>Assigned technician</dt>
                  <dd style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <IconUser size={16} />
                    {assignedTechnician?.email ?? (workOrder.assignedTechnicianId ? "Assigned" : "Unassigned")}
                  </dd>
                </div>
                <div>
                  <dt>Last updated</dt>
                  <dd>{formatDateTime(workOrder.updatedAt)}</dd>
                </div>
                <div className="detail-meta__full">
                  <dt>Work description</dt>
                  <dd className="detail-description">{workOrder.description || "No description provided."}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="panel panel__body">
            <SectionHeader
              title="Attachments"
              description="Photos, documents, and field evidence"
            />
            {canManage ? (
              <form className="form" onSubmit={(e) => void handleUpload(e)} style={{ marginBottom: "1rem" }}>
                <label>
                  Upload file (JPEG, PNG, or PDF)
                  <input type="file" name="file" accept="image/jpeg,image/png,application/pdf" required />
                </label>
                <div className="form__actions">
                  <button type="submit" className="btn btn--primary btn--sm" disabled={uploading}>
                    {uploading ? "Uploading…" : "Upload attachment"}
                  </button>
                </div>
              </form>
            ) : null}

            {attachments.length === 0 ? (
              <EmptyState
                icon={<IconPaperclip size={20} />}
                title="No attachments"
                description="Upload photos or documents related to this job."
              />
            ) : (
              <ul className="activity-list">
                {attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <button
                      type="button"
                      className="btn btn--link activity-list__action"
                      onClick={() => void handleDownload(attachment)}
                    >
                      {attachment.originalFilename}
                    </button>
                    <span className="activity-list__time">{formatFileSize(attachment.sizeBytes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel panel__body">
            <SectionHeader title="Activity history" description="Audit trail of changes and events" />
            <Timeline
              items={activity.map((entry) => ({
                id: entry.id,
                label: entry.action,
                timestamp: entry.createdAt,
              }))}
            />
          </div>
        </div>

        <aside className="detail-sidebar">
          {(showAssignForm || showTechnicianActions) ? (
            <div className="panel panel__body">
              <SectionHeader title="Field actions" />

              {showAssignForm ? (
                <form className="form" onSubmit={(e) => void handleAssign(e)}>
                  <label>
                    Assign technician
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
                    Scheduled start
                    <input
                      type="datetime-local"
                      value={scheduledStart}
                      onChange={(e) => setScheduledStart(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Scheduled end
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

              {showTechnicianActions ? (
                <div className="action-row">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={statusUpdating}
                    onClick={() => void handleStatusChange("in_progress")}
                  >
                    Start work
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={statusUpdating}
                    onClick={() => void handleStatusChange("completed")}
                  >
                    Mark completed
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="panel panel__body">
            <SectionHeader title="Job summary" />
            <dl className="detail-meta" style={{ gridTemplateColumns: "1fr" }}>
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(workOrder.createdAt)}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>
                  <Badge value={workOrder.priority} variant="priority" showDot={false} />
                </dd>
              </div>
              <div>
                <dt>Assignment version</dt>
                <dd>{workOrder.assignmentVersion}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
