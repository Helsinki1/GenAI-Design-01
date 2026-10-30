import { updateSession } from "./lib/supabase/proxy";
import { NextResponse } from "next/server";

export async function proxy(request) {
  // This endpoint validates its bearer JWT and admin role in the handler.
  if (request.nextUrl.pathname === "/api/admin/generate") return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
