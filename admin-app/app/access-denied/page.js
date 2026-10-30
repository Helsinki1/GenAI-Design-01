import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { signOut } from "../actions";

export default async function AccessDenied() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <main className="page">
      <section className="card auth-card">
        <p className="eyebrow">Caption Lab Admin</p>
        <h1>Admin access required</h1>
        <p className="copy">This account does not have permission to access the admin area.</p>
        <form action={signOut}><button className="auth-button">Sign out</button></form>
      </section>
    </main>
  );
}
