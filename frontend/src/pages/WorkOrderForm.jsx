import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, fieldErrors } from "../api.js";
import { ErrorBox, FieldError, Loading } from "../components/ui.jsx";
import { PRIORITIES } from "../constants.js";

const EMPTY = { title: "", description: "", priority: "medium", site_name: "" };

export default function WorkOrderForm() {
  const { id } = useParams();
  const edit = Boolean(id);
  const nav = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(edit);
  const [loadError, setLoadError] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!edit) return;
    api.getOrder(id)
      .then((o) => setForm({ title: o.title, description: o.description || "", priority: o.priority, site_name: o.site_name }))
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }, [id, edit]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const local = {};
    if (!form.title.trim()) local.title = "Title is required.";
    if (!form.site_name.trim()) local.site_name = "Site name is required.";
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;

    setBusy(true);
    try {
      const saved = edit ? await api.updateOrder(id, form) : await api.createOrder(form);
      nav(`/work-orders/${saved.id}`);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(err.message);
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (loadError) return <ErrorBox error={loadError} />;

  return (
    <form className="panel narrow" onSubmit={submit} noValidate>
      <h1>{edit ? "Edit work order" : "New work order"}</h1>
      {formError && <div className="banner error" role="alert">{formError}</div>}
      <label>Title
        <input value={form.title} onChange={set("title")} maxLength={200} aria-invalid={!!errors.title} />
        <FieldError msg={errors.title} />
      </label>
      <label>Site name
        <input value={form.site_name} onChange={set("site_name")} maxLength={200} aria-invalid={!!errors.site_name} />
        <FieldError msg={errors.site_name} />
      </label>
      <label>Priority
        <select value={form.priority} onChange={set("priority")}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <FieldError msg={errors.priority} />
      </label>
      <label>Description
        <textarea rows={5} value={form.description} onChange={set("description")} />
        <FieldError msg={errors.description} />
      </label>
      <div className="actions">
        <button type="button" onClick={() => nav(-1)}>Cancel</button>
        <button className="primary" disabled={busy}>{busy ? "Saving…" : edit ? "Save changes" : "Create work order"}</button>
      </div>
    </form>
  );
}
