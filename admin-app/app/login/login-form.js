"use client";

import { useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function LoginForm() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);

    try {
      const health = await fetch("/api/auth/health", { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!health.ok) throw new Error("Sign-in is temporarily unavailable. Please retry shortly or let the project owner know.");
      const { error: signInError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (signInError) throw signInError;
    } catch (cause) {
      setError(cause.message || "Google sign-in could not be started. Please retry.");
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
      {error ? <p role="alert" className="notice auth-error">{error}</p> : null}
    </>
  );
}
