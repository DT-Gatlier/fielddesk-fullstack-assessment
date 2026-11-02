import { useRef, useState } from "react";
import { api } from "../api.js";
import { STATUSES, TRANSITIONS, label } from "../constants.js";

// Technicians send an idempotent progress event; dispatchers/owners update status directly.
export default function StatusPanel({ order, role, onDone }) {
  const isTech = role === "technician";
  const options = isTech ? TRANSITIONS[order.status] || [] : STATUSES.filter((s) => s !== order.status);
  const [next, setNext] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  // One eventId per attempt: a retry after a network error re-sends the SAME id, so the server processes it once
  const eventId = useRef(crypto.randomUUID());

  if (options.length === 0) return <div className="panel"><h2>Update status</h2><p className="muted">No further status changes are available.</p></div>;

  async function submit(e) {
    e.preventDefault();
    if (!next) return setMsg({ kind: "error", text: "Choose a new status." });
    setBusy(true);
    setMsg(null);
    try {
      if (isTech) {
        const payload = { status: next };
        if (note.trim()) payload.note = note.trim();
        await api.sendEvent({
          eventId: eventId.current,
          workOrderId: order.id,
          type: "status_changed",
          occurredAt: new Date().toISOString(),
          payload,
        });
      } else {
        await api.setStatus(order.id, next);
      }
      eventId.current = crypto.randomUUID(); // success: next submission is a new event
      setNext(""); setNote("");
      setMsg({ kind: "ok", text: "Status updated." });
      onDone();
    } catch (err) {
      setMsg({ kind: "error", text: err.status === 409 ? `Conflict: ${err.message}` : err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Update status</h2>
      {msg && <div className={`banner ${msg.kind === "ok" ? "ok" : "error"}`} role={msg.kind === "ok" ? "status" : "alert"}>{msg.text}</div>}
      <label>New status
        <select value={next} onChange={(e) => setNext(e.target.value)}>
          <option value="">Select…</option>
          {options.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </label>
      {isTech && (
        <label>Note (optional)
          <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      <button className="primary" disabled={busy}>{busy ? "Saving…" : "Update status"}</button>
    </form>
  );
}
