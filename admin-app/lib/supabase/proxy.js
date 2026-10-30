import { authCookieOptions } from "./cookies";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

// Routes anyone can visit without signing in.
const PUBLIC_PATHS = ["/login", "/auth/callback"];

function isPublicPath(pathname) {
  return PUBLIC_PATHS.includes(pathname);
}

export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const redirect = NextResponse.redirect(loginUrl);
    // Keep any refreshed/cleared auth cookies on the redirect.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  // Every application route requires an admin, except login and the denial page.
  const { pathname } = request.nextUrl;
  if (user && !isPublicPath(pathname) && pathname !== "/access-denied") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/access-denied";
      homeUrl.search = "";
      const redirect = NextResponse.redirect(homeUrl);
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }
  }

  return response;
}
