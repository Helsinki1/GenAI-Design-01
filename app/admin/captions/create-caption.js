"use client";

import { useState, useTransition } from "react";
import { createCaption, generateAiCaption } from "./actions";

export default function CreateCaption({ images, defaultImageId }) {
  const [imageId, setImageId] = useState(defaultImageId ?? images[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState(null);
  const [pending, startTransition] = useTransition();
  const selected = images.find((image) => image.id === imageId);

  function run(action, success) {
    setStatus(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        setStatus({ error: result.error });
      } else {
        setStatus({ success });
        setContent("");
      }
    });
  }

  return (
    <form
      className="panel create-caption"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => createCaption({ imageId, content }), "Caption added.");
      }}
    >
      <h2 className="panel-title">New caption</h2>
      <div className="create-grid">
        {selected ? <img className="create-preview" src={selected.url} alt="" /> : null}
        <div className="create-fields">
          <label className="field">
            Image
            <select className="search-input" value={imageId}
              onChange={(event) => setImageId(event.target.value)}>
              {images.map((image, index) => (
                <option key={image.id} value={image.id}>
                  Image {images.length - index} · {image.url.split("/").pop()}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Caption
            <textarea className="search-input" rows={2} maxLength={300} value={content}
              placeholder="Write one yourself, or let the AI do it"
              onChange={(event) => setContent(event.target.value)} />
          </label>
          <div className="button-row">
            <button className="auth-button small-button" type="submit"
              disabled={pending || !content.trim()}>
              Add caption
            </button>
            <button className="secondary-button" type="button" disabled={pending || !imageId}
              onClick={() => run(() => generateAiCaption(imageId), "AI caption generated.")}>
              {pending ? "Working…" : "Generate with AI"}
            </button>
          </div>
          {status?.error ? <p className="notice auth-error">{status.error}</p> : null}
          {status?.success ? <p className="notice">{status.success}</p> : null}
        </div>
      </div>
    </form>
  );
}
