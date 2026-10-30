"use client";

import { useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function LoginForm() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (signInError) {
      setError(signInError.message || "Google sign-in could not be started.");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        className="auth-button"
        type="button"
        onClick={signInWithGoogle}
        disabled={loading}
      >
        {loading ? "Redirecting…" : "Continue with Google"}
      </button>
      {error ? <p className="notice auth-error">{error}</p> : null}
    </>
  );
}
