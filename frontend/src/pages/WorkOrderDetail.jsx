import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import Activity from "../components/Activity.jsx";
import AssignPanel from "../components/AssignPanel.jsx";
import Attachments from "../components/Attachments.jsx";
import StatusPanel from "../components/StatusPanel.jsx";
import { ErrorBox, Loading, PriorityBadge, StatusBadge } from "../components/ui.jsx";
import { canManage, fmt } from "../constants.js";
import { useFetch } from "../hooks/useFetch.js";
import { useLiveRefresh } from "../hooks/live.js";

export default function WorkOrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [version, setVersion] = useState(0); // bump to refetch activity + attachments too
  const { data: o, loading, error, reload } = useFetch(() => api.getOrder(id), [id]);

  const refresh = () => { reload(true); setVersion((v) => v + 1); };
  useLiveRefresh((ev) => { if (ev.kind === "resync" || String(ev.id) === String(id)) refresh(); });

  if (loading && !o) return <Loading />;
  if (error && !o) return <ErrorBox error={error} onRetry={reload} />;

  const manager = canManage(user);
  const dl = (k, v) => <div><dt>{k}</dt><dd>{v}</dd></div>;

  return (
    <>
      <p><Link to="/work-orders">← Work orders</Link></p>
      <div className="page-head">
        <div>
          <small className="muted">{o.reference}</small>
          <h1>{o.title}</h1>
        </div>
        {manager && <Link className="button" to={`/work-orders/${o.id}/edit`}>Edit</Link>}
      </div>

      <section className="panel">
        <dl className="facts">
          {dl("Status", <StatusBadge status={o.status} />)}
          {dl("Priority", <PriorityBadge priority={o.priority} />)}
          {dl("Site", o.site_name)}
          {dl("Technician", o.technician_name || (o.technician ? `#${o.technician}` : "Unassigned"))}
          {dl("Scheduled start", fmt(o.start_at))}
          {dl("Scheduled end", fmt(o.end_at))}
          {dl("Created", fmt(o.created_at))}
          {dl("Last updated", fmt(o.updated_at))}
        </dl>
        {o.description && <p className="desc">{o.description}</p>}
      </section>

      <div className="two-col">
        <div>
          {manager && <AssignPanel order={o} onDone={refresh} />}
          <StatusPanel key={o.status} order={o} role={user.role} onDone={refresh} />
          <Attachments orderId={o.id} canUpload={manager} version={version} />
        </div>
        <Activity orderId={o.id} version={version} />
      </div>
    </>
  );
}
