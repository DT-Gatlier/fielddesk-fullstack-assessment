"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  assignWorkOrder,
  getMe,
  getWorkOrder,
  listOrgUsers,
  updateWorkOrder,
  updateWorkOrderStatus,
  type AuditEntry,
  type AuthUser,
  type WorkOrder,
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
      setError(err instanceof Error ? err.message : "Assignment failed");
    }
  }

  async function handleStatusChange(status: string) {
    if (!workOrder) return;
    try {
      const result = await updateWorkOrderStatus(workOrder.id, status);
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
