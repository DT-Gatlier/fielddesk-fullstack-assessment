import { useRef, useState } from "react";
import { api } from "../api.js";
import { useFetch } from "../hooks/useFetch.js";
import { ALLOWED_TYPES, MAX_UPLOAD } from "../constants.js";
import { EmptyState, ErrorBox, Loading } from "./ui.jsx";

const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function Attachments({ orderId, canUpload, version }) {
  const { data, loading, error, reload } = useFetch(() => api.attachments(orderId), [orderId, version]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  async function onPick(e) {
    const file = e.target.files[0];
    if (!file) return;
    setMsg(null);
    // client-side hints only; the backend validates type (by content), size and quota
    if (!ALLOWED_TYPES.includes(file.type)) return setMsg("Only PNG, JPEG or PDF files can be attached.");
    if (file.size > MAX_UPLOAD) return setMsg(`File is too large (max ${kb(MAX_UPLOAD)}).`);
    setBusy(true);
    try {
      await api.upload(orderId, file);
      reload();
    } catch (err) {
      setMsg(err.status === 413 || err.status === 409 ? `Upload rejected: ${err.message}` : err.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function open(a) {
    try { await api.downloadAttachment(a); } catch (err) { setMsg(err.message); }
  }

  return (
    <section className="panel">
      <h2>Attachments</h2>
      {msg && <div className="banner error" role="alert">{msg}</div>}
      {canUpload && (
        <label className="upload">Add image or PDF
          <input ref={input} type="file" accept=".png,.jpg,.jpeg,.pdf" onChange={onPick} disabled={busy} />
          {busy && <small>Uploading…</small>}
        </label>
      )}
      {loading && !data ? <Loading /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> :
        data.length === 0 ? <EmptyState title="No attachments yet" /> : (
          <ul className="list">
            {data.map((a) => (
              <li key={a.id}>
                <button className="link" onClick={() => open(a)}>{a.original_name || `File ${a.id}`}</button>
                <small>{a.content_type} · {kb(a.size)}</small>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
