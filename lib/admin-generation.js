import { createClient } from "@supabase/supabase-js";
import { generateForImage } from "./generation.js";

// Both apps use the same Supabase JWTs. Keep the provider secret in this app;
// authenticate the caller and retain their RLS permissions for every write.
export async function handleAdminGeneration(request, generate = generateForImage) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return Response.json({ error: "Sign in required." }, { status: 401 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) return Response.json({ error: "Admins only." }, { status: 403 });
  let input;
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof input?.imageId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.imageId)) {
    return Response.json({ error: "Invalid image ID." }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "AI generation is not configured." }, { status: 503 });
  const { data: image, error: imageError } = await supabase.from("images").select("id, url").eq("id", input.imageId).maybeSingle();
  if (imageError || !image) return Response.json({ error: imageError?.message || "Image not found." }, { status: 404 });
  const result = await generate(supabase, user, image, true);
  return Response.json(result, { status: result.error ? 502 : 200 });
}
