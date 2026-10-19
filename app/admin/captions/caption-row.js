"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteCaption, updateCaption } from "./actions";

export default function CaptionRow({ caption }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(caption.content);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function save(event) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateCaption({ id: caption.id, content: draft });
      if (result.error) setError(result.error);
      else setEditing(false);
    });
  }

  function remove() {
    if (!window.confirm("Delete this caption and all of its votes?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCaption(caption.id);
      if (result.error) setError(result.error);
    });
  }

  const created = new Date(caption.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <li className={`admin-caption${pending ? " is-pending" : ""}`}>
      <Link className="admin-caption-thumb" href={`/admin/captions?image=${caption.imageId}`}
        title="Show captions for this image">
        {caption.imageUrl ? <img src={caption.imageUrl} alt="" /> : <span>No image</span>}
      </Link>

      <div className="admin-caption-body">
        {editing ? (
          <form className="caption-edit" onSubmit={save}>
            <textarea
              className="search-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={300}
              rows={2}
              autoFocus
            />
            <div className="button-row">
              <button className="auth-button small-button" type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setDraft(caption.content);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p className="caption-text">{caption.content}</p>
        )}

        <div className="caption-meta">
          {caption.model ? (
            <span className="ai-badge">AI · {caption.model}</span>
          ) : (
            <span className="role-badge">{caption.author ? "Written by admin" : "Seed"}</span>
          )}
          <span>▲ {caption.up} · ▼ {caption.down}</span>
          <span>{created}</span>
          {caption.author ? <span>by {caption.author}</span> : null}
        </div>
        {error ? <p className="notice auth-error">{error}</p> : null}
      </div>

      {editing ? null : (
        <div className="button-row admin-caption-actions">
          <button className="secondary-button" type="button" onClick={() => setEditing(true)}
            disabled={pending}>
            Edit
          </button>
          <button className="secondary-button danger-button" type="button" onClick={remove}
            disabled={pending}>
            Delete
          </button>
        </div>
      )}
    </li>
  );
}
