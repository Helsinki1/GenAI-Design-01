import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import LoginForm from "./login-form";

export default async function LoginPage({ searchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  const params = (await searchParams) ?? {};
  const authError = typeof params.error === "string" ? params.error : null;

  return (
    <main className="page">
      <section className="card auth-card">
        <p className="eyebrow">Caption Lab</p>
        <h1>Sign in</h1>
        <p className="copy">Sign in with Google to browse the caption gallery.</p>
        {authError ? <p className="notice auth-error">{authError}</p> : null}
        <LoginForm />
      </section>
    </main>
  );
}
