"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { saveResource, deleteResource } from "./actions";

const label = (key) => key.replaceAll("_", " ");
const display = (value) => value == null ? "—" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);

export default function ResourceManager({ slug, config, rows, options, userId }) {
  const router = useRouter();
  const dialog = useRef(null);
  const [mode, setMode] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [file, setFile] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function open(nextMode, row = null) {
    setMode(nextMode); setSelected(row); setError(""); setFile(null);
    setForm(Object.fromEntries(config.fields.map((field) => [field.key, row?.[field.key] ?? field.default ?? (field.type === "checkbox" ? false : "")])));
    dialog.current.showModal();
  }

  async function submit(event) {
    event.preventDefault();
    setPending(true); setError("");
    let uploadedPath;
    const supabase = createClient();
    try {
      const payload = { ...form };
      if (mode === "create" && file) {
        const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
        if (!extensions[file.type] || file.size > 10 * 1024 * 1024 || !file.size) throw new Error("Choose a JPEG, PNG, WebP, or GIF up to 10 MB.");
        const path = `${userId}/${crypto.randomUUID()}.${extensions[file.type]}`;
        const result = await supabase.storage.from("uploads").upload(path, file, { contentType: file.type });
        if (result.error) throw result.error;
        uploadedPath = path;
        payload.url = supabase.storage.from("uploads").getPublicUrl(path).data.publicUrl;
      }
      const result = mode === "delete"
        ? await deleteResource(slug, selected.id)
        : await saveResource(slug, selected?.id || null, payload);
      if (result.error) throw new Error(result.error);
      uploadedPath = null;
      dialog.current.close();
      setNotice(mode === "delete" ? "Record deleted." : "Record saved.");
      router.refresh();
    } catch (error) {
      let message = error.message || "Request failed. Please retry.";
      if (uploadedPath) {
        const cleanup = await supabase.storage.from("uploads").remove([uploadedPath]);
        if (cleanup.error) message += " The uploaded file could not be cleaned up.";
      }
      setError(message);
    } finally { setPending(false); }
  }

  return <>
    {notice && <p className="notice" role="status">{notice}</p>}
    {config.create && <button className="auth-button" onClick={() => open("create")}>Add record</button>}
    {rows.length ? <div className="table-scroll"><table className="admin-table resource-table">
      <thead><tr>{config.columns.map((key) => <th key={key}>{label(key)}</th>)}<th>Actions</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        {config.columns.map((key) => <td key={key}>
          {slug === "images" && key === "url" && <img className="resource-thumb" src={row.url} alt="Image preview" loading="lazy" />}
          <span className="resource-cell">{display(row[key])}</span>
        </td>)}
        <td><div className="resource-actions">
          <button className="secondary-button" onClick={() => open("view", row)}>View</button>
          {config.update && <button className="secondary-button" onClick={() => open("edit", row)}>Edit</button>}
          {config.delete && <button className="secondary-button danger-button" onClick={() => open("delete", row)}>Delete</button>}
        </div></td>
      </tr>)}</tbody>
    </table></div> : <p className="empty">No records found.</p>}

    <dialog ref={dialog} className="resource-dialog" aria-labelledby="resource-dialog-title" onCancel={(event) => { if (pending) event.preventDefault(); }}>
      <h2 id="resource-dialog-title">{mode === "view" ? "Record details" : mode === "delete" ? "Delete record?" : mode === "edit" ? "Edit record" : "Add record"}</h2>
      {mode === "view" ? <>
        {(slug === "images" || selected?.images?.url) && <img className="resource-preview" src={slug === "images" ? selected?.url : selected.images.url} alt="Full image" />}
        {selected?.image_id && <Link href={`/caption-rating/${selected.image_id}`}>View image and captions</Link>}
        <dl className="resource-details">{Object.entries(selected || {}).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd><pre>{display(value)}</pre></dd></div>)}</dl>
        <button className="auth-button" onClick={() => dialog.current.close()}>Close</button>
      </> : <form onSubmit={submit}>
        <fieldset disabled={pending}>
          {mode === "delete" ? <p>This removes record <code>{selected?.id}</code>. Related records may prevent deletion.</p> : <>
            {slug === "images" && mode === "create" && <label>Upload image
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              <small>Or enter a hosted image URL below. Maximum upload size: 10 MB.</small>
            </label>}
            {config.fields.map((field) => <label key={field.key}>
              {field.label}
              {field.type === "checkbox" ? <input type="checkbox" checked={form[field.key] === true} onChange={(event) => setForm({ ...form, [field.key]: event.target.checked })} />
                : field.type === "reference" ? <select required value={form[field.key] ?? ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}><option value="">Choose…</option>{options[field.key]?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
                : field.type === "textarea" ? <textarea rows={4} required={field.required} value={form[field.key] ?? ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} />
                : <input type={field.type === "domain" ? "text" : field.type} required={field.required && !(field.key === "url" && file)} disabled={field.key === "url" && !!file} min={field.min} max={field.max} step={field.type === "number" ? 1 : undefined} placeholder={field.placeholder} value={form[field.key] ?? ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} />}
            </label>)}
          </>}
          {error && <p className="notice auth-error" role="alert">{error}</p>}
          <div className="resource-actions">
            <button className="secondary-button" type="button" onClick={() => dialog.current.close()}>Cancel</button>
            <button className="auth-button" type="submit">{pending ? "Saving…" : mode === "delete" ? "Confirm delete" : "Save record"}</button>
          </div>
        </fieldset>
      </form>}
    </dialog>
  </>;
}
