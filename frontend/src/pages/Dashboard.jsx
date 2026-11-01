import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { EmptyState, ErrorBox, Loading } from "../components/ui.jsx";
import { STATUSES, canManage, label } from "../constants.js";
import { useFetch } from "../hooks/useFetch.js";
import { useLiveRefresh } from "../hooks/live.js";

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch(() => api.dashboard(), []);
  useLiveRefresh(() => reload(true));

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const counts = data.by_status || {};

  return (
    <>
      <h1>Dashboard</h1>
      <p className="muted">{user.role === "technician" ? "Work assigned to you" : "All work orders in your organisation"}</p>
      <div className="stats">
        <Link to="/work-orders" className="stat"><span>Total</span><strong>{data.total}</strong></Link>
        {STATUSES.map((s) => (
          <Link key={s} to={`/work-orders?status=${s}`} className="stat">
            <span>{label(s)}</span><strong>{counts[s] ?? 0}</strong>
          </Link>
        ))}
      </div>
      {data.total === 0 && (
        <EmptyState title="No work orders yet">
          {canManage(user) ? <Link to="/work-orders/new">Create the first work order</Link> : <p>Nothing has been assigned to you.</p>}
        </EmptyState>
      )}
    </>
  );
}
