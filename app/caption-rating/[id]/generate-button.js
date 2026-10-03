"use client";

import { useState, useTransition } from "react";
import { generateCaption } from "../actions";

export default function GenerateButton({ imageId }) {
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await generateCaption(imageId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="generate">
      <button
        className="auth-button generate-button"
        type="button"
        onClick={handleClick}
        disabled={pending}
      >
        {pending ? "Generating…" : "Generate caption with AI"}
      </button>
      {error ? <p className="notice auth-error">{error}</p> : null}
    </div>
  );
}
