"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "../lib/supabase/client";
import { addUploadedImage } from "./caption-rating/actions";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export default function UploadImage({ userId }) {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [pending, startTransition] = useTransition();

  function handleChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_IMAGE_BYTES) {
      setStatus({ error: "Images must be 10 MB or smaller." });
      return;
    }

    setStatus(null);
    startTransition(async () => {
      // Files go to Storage; only the public URL is saved on the image row.
      const supabase = createClient();
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        setStatus({ error: `Upload failed: ${uploadError.message}` });
        return;
      }

      const { data } = supabase.storage.from("uploads").getPublicUrl(path);
      const result = await addUploadedImage(data.publicUrl);

      if (result.error) {
        setStatus({ error: result.error });
      } else {
        setStatus({ success: "Uploaded! Your image has 3 fresh AI captions." });
        router.refresh();
      }
    });
  }

  return (
    <div className="upload">
      <label className={`auth-button upload-button${pending ? " is-pending" : ""}`}>
        {pending ? "Uploading & captioning…" : "Upload your own image"}
        <input
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleChange}
          disabled={pending}
        />
      </label>
      {status?.error ? <p className="notice auth-error">{status.error}</p> : null}
      {status?.success ? <p className="notice">{status.success}</p> : null}
    </div>
  );
}
