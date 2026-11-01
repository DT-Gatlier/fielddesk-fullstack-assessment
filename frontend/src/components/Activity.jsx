import { api } from "../api.js";
import { useFetch } from "../hooks/useFetch.js";
import { fmt, label } from "../constants.js";
import { EmptyState, ErrorBox, Loading } from "./ui.jsx";

const brief = (v) => (v && typeof v === "object" ? Object.entries(v).map(([k, x]) => `${label(k)}: ${x ?? "—"}`).join(", ") : "");

export default function Activity({ orderId, version }) {
  const { data, loading, error, reload } = useFetch(() => api.activity(orderId), [orderId, version]);
  return (
    <section className="panel">
      <h2>Activity</h2>
      {loading && !data ? <Loading /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> :
        data.length === 0 ? <EmptyState title="No activity recorded yet" /> : (
          <ol className="timeline">
            {data.map((a) => (
              <li key={a.id}>
                <strong>{label(a.action.replace(".", " "))}</strong>
                <small>{fmt(a.created_at)} · {a.actor_name || (a.actor ? `user #${a.actor}` : "system")}</small>
                {a.before && <div className="muted small">Before: {brief(a.before)}</div>}
                {a.after && <div className="muted small">After: {brief(a.after)}</div>}
              </li>
            ))}
          </ol>
        )}
    </section>
  );
}
