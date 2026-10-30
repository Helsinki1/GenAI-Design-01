import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/admin", url.origin));
  }
  const login = new URL("/login", url.origin);
  login.searchParams.set("error", "Sign-in could not be completed. Please try again.");
  return NextResponse.redirect(login);
}
