import { useState } from "react";
import { api, fieldErrors } from "../api.js";
import { FieldError } from "./ui.jsx";
import { useFetch } from "../hooks/useFetch.js";

// Scheduling + assignment. All overlap rules are enforced by the backend (409); the client check is UX only.
export default function AssignPanel({ order, onDone }) {
  const { data: techs, error: techError } = useFetch(() => api.technicians(), []);
  const [tech, setTech] = useState(order.technician ? String(order.technician) : "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null); // { kind: "error" | "conflict" | "ok", text }
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMessage(null);
    const local = {};
    if (!tech) local.technician = "Choose a technician.";
    if (!start) local.start_at = "Choose a start time.";
    if (!end) local.end_at = "Choose an end time.";
    if (start && end && new Date(end) <= new Date(start)) local.end_at = "End must be after the start.";
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    try {
      await api.assign(order.id, {
        technician: Number(tech),
        start_at: new Date(start).toISOString(),
        end_at: new Date(end).toISOString(),
      });
      setMessage({ kind: "ok", text: "Technician assigned." });
      onDone();
    } catch (err) {
      setErrors(fieldErrors(err));
      setMessage({
        kind: err.status === 409 ? "conflict" : "error",
        text: err.status === 409 ? `Scheduling conflict: ${err.message} Pick another time or technician.` : err.message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <h2>Assign and schedule</h2>
      {message && (
        <div className={`banner ${message.kind === "ok" ? "ok" : message.kind === "conflict" ? "warn" : "error"}`} role={message.kind === "ok" ? "status" : "alert"}>
          {message.text}
        </div>
      )}
      {techError && <div className="banner error">Could not load technicians: {techError.message}</div>}
      <label>Technician
        <select value={tech} onChange={(e) => setTech(e.target.value)}>
          <option value="">Select…</option>
          {(techs || []).map((t) => <option key={t.id} value={t.id}>{t.username}</option>)}
        </select>
        <FieldError msg={errors.technician} />
      </label>
      <div className="row">
        <label>Start
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <FieldError msg={errors.start_at} />
        </label>
        <label>End
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          <FieldError msg={errors.end_at} />
        </label>
      </div>
      <button className="primary" disabled={busy}>{busy ? "Assigning…" : "Assign technician"}</button>
    </form>
  );
}
