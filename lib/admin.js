import { notFound, redirect } from "next/navigation";
import { createClient } from "./supabase/server";

// Returns { supabase, user } when the signed-in user is an admin, otherwise
// { supabase, user, error }. Use in server actions, which skip layouts and pages.
export async function getAdminClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user, error: "You need to sign in." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return { supabase, user, error: "Admins only." };
  }

  return { supabase, user, error: null };
}

// For admin pages: sends signed-out users to /login and hides the page from non-admins.
export async function requireAdmin() {
  const admin = await getAdminClient();
  if (!admin.user) redirect("/login");
  if (admin.error) notFound();
  return admin;
}

const PAGE_SIZE = 1000;

// Supabase caps each response at 1000 rows, so page through to get them all.
// `buildQuery` must return a fresh, ordered select query each time.
export async function fetchAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...data);
    if (data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

export function displayName(profile) {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  return name || profile?.email || "Unknown user";
}
