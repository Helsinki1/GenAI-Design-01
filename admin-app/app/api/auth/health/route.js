export const dynamic = "force-dynamic";

// Public, bounded availability probe. Never returns credentials or participant data.
export async function GET() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(5000), cache: "no-store",
    });
    if (!response.ok) throw new Error("Auth unavailable");
    const settings = await response.json();
    if (settings.external?.google !== true) throw new Error("Google unavailable");
    return Response.json({ available: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ available: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
