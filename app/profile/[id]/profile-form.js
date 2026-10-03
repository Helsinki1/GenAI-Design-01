"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "../../../lib/supabase/client";
import { updateProfile } from "../actions";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export default function ProfileForm({ profile }) {
  const [firstName, setFirstName] = useState(profile.first_name ?? "");
  const [lastName, setLastName] = useState(profile.last_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(profile.avatar_url);
  const [status, setStatus] = useState(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!photo) return undefined;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function handlePhotoChange(event) {
    const file = event.target.files?.[0] ?? null;
    if (file && file.size > MAX_PHOTO_BYTES) {
      setStatus({ error: "Photos must be 5 MB or smaller." });
      event.target.value = "";
      return;
    }
    setStatus(null);
    setPhoto(file);
  }

  function handleSubmit(event) {
    event.preventDefault();
    setStatus(null);

    startTransition(async () => {
      let avatarUrl = profile.avatar_url;

      if (photo) {
        // Photos go to Storage; only the public URL is saved on the profile row.
        const supabase = createClient();
        const path = `${profile.id}/avatar`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, photo, { upsert: true, contentType: photo.type });

        if (uploadError) {
          setStatus({ error: `Photo upload failed: ${uploadError.message}` });
          return;
        }

        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        // The path never changes, so bust caches with a version query.
        avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      }

      const result = await updateProfile({
        firstName,
        lastName,
        bio,
        avatarUrl,
      });

      if (result.error) {
        setStatus({ error: result.error });
      } else {
        setPhoto(null);
        setStatus({ success: "Profile saved." });
      }
    });
  }

  return (
    <form className="profile-form" onSubmit={handleSubmit}>
      <div className="avatar-row">
        {preview ? (
          <img className="avatar" src={preview} alt="Your profile photo" />
        ) : (
          <div className="avatar avatar-placeholder">No photo</div>
        )}
        <label className="secondary-button file-button">
          {preview ? "Change photo" : "Upload photo"}
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handlePhotoChange}
          />
        </label>
      </div>

      <label className="field">
        <span>First name</span>
        <input
          className="search-input"
          value={firstName}
          maxLength={100}
          onChange={(event) => setFirstName(event.target.value)}
        />
      </label>

      <label className="field">
        <span>Last name</span>
        <input
          className="search-input"
          value={lastName}
          maxLength={100}
          onChange={(event) => setLastName(event.target.value)}
        />
      </label>

      <label className="field">
        <span>Bio</span>
        <textarea
          className="search-input"
          rows={4}
          value={bio}
          maxLength={500}
          onChange={(event) => setBio(event.target.value)}
        />
      </label>

      <button className="auth-button" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </button>

      {status?.error ? <p className="notice auth-error">{status.error}</p> : null}
      {status?.success ? <p className="notice">{status.success}</p> : null}
    </form>
  );
}
