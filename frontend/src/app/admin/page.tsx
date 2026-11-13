"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { apiRequest, AuthUser } from "@/lib/api";
import { AppDispatch, RootState, setAdminOrganisation, setAdminUsers, setAuditEntries, setCurrentUser, setNotificationDeliveries, upsertAdminUser } from "@/lib/store";
import { useToast } from "@/components/toast";

type User = { id: string; email: string; name: string; role: "OWNER" | "DISPATCHER" | "TECHNICIAN"; isActive: boolean; createdAt: string };
type Organisation = { id: string; name: string; slug: string; storageUsedBytes: string; storageLimitBytes: string };
type Entry = { id: string; action: string; targetType: string; targetId: string; createdAt: string; actor?: { name: string; email: string } | null; before?: unknown; after?: unknown };
type Delivery = { id: string; jobId: string; workOrderId: string; technicianId: string; status: string; attempts: number; lastError: string | null; queuedAt: string; completedAt: string | null };

export default function AdminPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();
  const user = useSelector((state: RootState) => state.session.user);
  const { users, organisation, audit, deliveries } = useSelector((state: RootState) => state.admin);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"users" | "settings" | "audit" | "notifications">("users");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<User["role"]>("DISPATCHER");
  const [orgName, setOrgName] = useState("");
  const [storageLimit, setStorageLimit] = useState(50);
  const [pageError, setPageError] = useState("");

  const load = useCallback(async () => {
    const [usersRes, orgRes, auditRes, deliveryRes] = await Promise.all([
      apiRequest<{ users: User[] }>("/api/admin/users"),
      apiRequest<{ organisation: Organisation }>("/api/admin/organisation"),
      apiRequest<{ entries: Entry[] }>("/api/admin/audit"),
      apiRequest<{ deliveries: Delivery[] }>("/api/admin/notifications"),
    ]);
    dispatch(setAdminUsers(usersRes.users));
    dispatch(setAdminOrganisation(orgRes.organisation));
    dispatch(setAuditEntries(auditRes.entries));
    dispatch(setNotificationDeliveries(deliveryRes.deliveries));
    setOrgName(orgRes.organisation.name);
    setStorageLimit(Math.round(Number(orgRes.organisation.storageLimitBytes) / 1048576));
  }, [dispatch]);

  useEffect(() => {
    let alive = true;
    apiRequest<{ user: AuthUser }>("/api/auth/me").then(({ user: current }) => {
      if (!alive) return;
      dispatch(setCurrentUser(current));
      if (current.role !== "OWNER") router.replace("/dashboard");
      else void load().catch((e) => setPageError(e instanceof Error ? e.message : "Could not load admin data"));
    }).catch(() => router.replace("/login")).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dispatch, load, router]);

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setPageError("");
    try {
      const result = await apiRequest<{ user: User }>("/api/admin/users", { method: "POST", body: JSON.stringify({ name, email, password, role }) });
      dispatch(upsertAdminUser(result.user)); setName(""); setEmail(""); setPassword(""); showToast("User added to this organisation", "success");
      await load();
    } catch (e) { setPageError(e instanceof Error ? e.message : "Could not create user"); }
    finally { setSaving(false); }
  }

  async function updateUser(userId: string, patch: Partial<Pick<User, "role" | "isActive">>) {
    try { const result = await apiRequest<{ user: User }>(`/api/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(patch) }); dispatch(upsertAdminUser(result.user)); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : "Could not update user", "error"); }
  }

  async function saveOrganisation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    try {
      const result = await apiRequest<{ organisation: Organisation }>("/api/admin/organisation", { method: "PATCH", body: JSON.stringify({ name: orgName, storageLimitBytes: storageLimit * 1048576 }) });
      dispatch(setAdminOrganisation(result.organisation)); showToast("Organisation settings saved", "success"); await load();
    } catch (e) { setPageError(e instanceof Error ? e.message : "Could not save settings"); }
    finally { setSaving(false); }
  }

  if (loading) return <main className="admin-page"><p>Loading organisation controls…</p></main>;
  if (user?.role !== "OWNER") return null;
  const used = Number(organisation?.storageUsedBytes || 0);
  const limit = Number(organisation?.storageLimitBytes || 1);

  return <main className="admin-page">
    <header className="admin-header"><div><button className="admin-back" onClick={() => router.push("/dashboard")}>← Dashboard</button><p className="admin-eyebrow">ORGANISATION CONTROL CENTER</p><h1>Admin settings</h1><p>Manage access, storage, and review the operational audit trail.</p></div><div className="admin-tenant"><span className="admin-tenant-dot" />{organisation?.name || "Your organisation"}<small>{organisation?.slug}</small></div></header>
    <nav className="admin-tabs">{(["users", "settings", "audit", "notifications"] as const).map((item) => <button key={item} className={tab === item ? "selected" : ""} onClick={() => setTab(item)}>{item === "users" ? "Team members" : item === "settings" ? "Organisation settings" : item === "audit" ? "Audit history" : "Notifications"}</button>)}</nav>
    {pageError && <p className="admin-error" role="alert">{pageError}</p>}
    {tab === "users" && <section className="admin-grid">
      <article className="admin-card"><div className="admin-card-head"><div><span className="admin-eyebrow">ACCESS DIRECTORY</span><h2>Team members</h2></div><span className="admin-count">{users.length} accounts</span></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Manage</th></tr></thead><tbody>{users.map((member) => <tr key={member.id}><td><strong>{member.name}</strong><small>{member.email}</small></td><td><select value={member.role} onChange={(e) => void updateUser(member.id, { role: e.target.value as User["role"] })}><option>OWNER</option><option>DISPATCHER</option><option>TECHNICIAN</option></select></td><td><span className={`admin-status ${member.isActive ? "active" : "inactive"}`}>{member.isActive ? "Active" : "Paused"}</span></td><td><button className="admin-small-button" disabled={member.id === user.id} onClick={() => void updateUser(member.id, { isActive: !member.isActive })}>{member.isActive ? "Suspend" : "Reactivate"}</button></td></tr>)}</tbody></table></div>
      </article>
      <article className="admin-card admin-form-card"><span className="admin-eyebrow">NEW ACCOUNT</span><h2>Invite a teammate</h2><form onSubmit={addUser}><label>Full name<input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Rivera" /></label><label>Work email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@company.com" /></label><label>Temporary password<input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label><label>Role<select value={role} onChange={(e) => setRole(e.target.value as User["role"])}><option value="DISPATCHER">Dispatcher</option><option value="TECHNICIAN">Technician</option><option value="OWNER">Owner</option></select></label><button className="admin-primary" disabled={saving}>{saving ? "Adding member…" : "Add team member"}</button></form></article>
    </section>}
    {tab === "settings" && <section className="admin-grid"><article className="admin-card admin-form-card"><span className="admin-eyebrow">TENANT PROFILE</span><h2>Organisation settings</h2><form onSubmit={saveOrganisation}><label>Organisation name<input required minLength={2} value={orgName} onChange={(e) => setOrgName(e.target.value)} /></label><label>Storage allowance (MB)<input type="number" min={1} max={5000000} value={storageLimit} onChange={(e) => setStorageLimit(Number(e.target.value))} /></label><button className="admin-primary" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button></form></article><article className="admin-card"><span className="admin-eyebrow">FILE STORAGE</span><h2>Storage usage</h2><div className="storage-usage"><strong>{(used / 1048576).toFixed(1)} <small>MB</small></strong><span>of {(limit / 1048576).toFixed(0)} MB</span></div><div className="storage-track"><i style={{ width: `${Math.min(100, used / Math.max(1, limit) * 100)}%` }} /></div><p className="admin-muted">Usage is tracked per organisation and enforced when files are uploaded.</p></article></section>}
    {tab === "audit" && <section className="admin-card"><div className="admin-card-head"><div><span className="admin-eyebrow">IMMUTABLE ACTIVITY</span><h2>Audit history</h2></div><span className="admin-count">Latest {audit.length}</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Action</th><th>Actor</th><th>Target</th><th>Time</th><th>Changes</th></tr></thead><tbody>{audit.map((item) => <tr key={item.id}><td><span className="audit-action">{item.action.replaceAll("_", " ").replaceAll(".", " · ")}</span></td><td>{item.actor?.name || "System"}<small>{item.actor?.email || "Automated worker"}</small></td><td>{item.targetType}<small>{item.targetId}</small></td><td>{new Date(item.createdAt).toLocaleString()}</td><td className="audit-json">{item.after ? JSON.stringify(item.after) : "—"}</td></tr>)}</tbody></table>{audit.length === 0 && <p className="admin-empty">No audit events yet.</p>}</div></section>}
    {tab === "notifications" && <section className="admin-card"><div className="admin-card-head"><div><span className="admin-eyebrow">DELIVERY MONITOR</span><h2>Technician notifications</h2></div><span className="admin-count">{deliveries.length} recent jobs</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Work order</th><th>Technician</th><th>Status</th><th>Attempts</th><th>Last detail</th><th>Queued</th></tr></thead><tbody>{deliveries.map((d) => <tr key={d.id}><td>{d.workOrderId}</td><td>{d.technicianId}</td><td><span className={`admin-status ${d.status === "DELIVERED" ? "active" : d.status === "FAILED" ? "inactive" : "pending"}`}>{d.status}</span></td><td>{d.attempts}</td><td>{d.lastError || "—"}</td><td>{new Date(d.queuedAt).toLocaleString()}</td></tr>)}</tbody></table>{deliveries.length === 0 && <p className="admin-empty">No notification jobs recorded yet.</p>}</div></section>}
  </main>;
}
