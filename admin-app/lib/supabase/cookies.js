// Keep this app's session separate, including when both apps run on localhost.
export function authCookieOptions() {
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  return { name: `sb-admin-${project}-auth-token` };
}
