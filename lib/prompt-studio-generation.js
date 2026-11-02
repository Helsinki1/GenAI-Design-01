import { createClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const OPENAI_PROVIDER = "70000000-0000-4000-8000-000000000001";

export function buildStepInput(run) {
  const step = run.steps_snapshot?.[run.step_outputs.length];
  if (!step) throw new Error("No step is ready to run.");
  if (step.provider_id !== OPENAI_PROVIDER) throw new Error("Only OpenAI models are configured.");
  const previous = run.step_outputs.at(-1)?.output || "";
  const interpolate = (value) => value.replace(/\{\{(previous|count)\}\}/g, (_, key) => key === "previous" ? previous : String(run.requested_count));
  const system = interpolate(step.system_prompt) + (step.output_kind === "captions" ? '\nReturn JSON only: {"captions":["caption text"]}. Each caption must be 1–300 characters.' : "");
  let user = interpolate(step.user_prompt);
  // The previous output always reaches the next step, even without a placeholder.
  if (previous && !step.user_prompt.includes("{{previous}}") && !step.system_prompt.includes("{{previous}}")) user += `\nPrevious step output:\n${previous}`;
  if (system.length + user.length > 60000) throw new Error("The combined prompt is too long.");
  return { step, system, user };
}

export async function requestPromptStep(run, fetcher = fetch) {
  const { step, system, user } = buildStepInput(run);
  const content = [{ type: "text", text: user }];
  if (step.include_image) {
    const url = new URL(run.source_image_url);
    if (url.protocol !== "https:") throw new Error("The source image must use HTTPS.");
    // The provider fetches the public image; this server never follows arbitrary URLs.
    content.push({ type: "image_url", image_url: { url: url.href } });
  }
  const response = await fetcher("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(45000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: step.model, max_completion_tokens: 1800,
      ...(step.output_kind === "captions" ? { response_format: { type: "json_object" } } : {}),
      messages: [{ role: "system", content: system }, { role: "user", content }],
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || `Model request failed (${response.status}).`);
  const raw = body?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || !raw.trim() || raw.length > 30000 || body.choices[0].finish_reason === "length") throw new Error("The model returned empty, truncated, or oversized output. Try a more concise prompt.");
  let captions = null;
  if (step.output_kind === "captions") {
    let parsed; try { parsed = JSON.parse(raw); } catch { throw new Error("The model did not return valid caption JSON."); }
    if (!Array.isArray(parsed.captions) || !parsed.captions.length || parsed.captions.some(c => typeof c !== "string" || !c.trim() || c.trim().length > 300)) throw new Error("The model returned invalid captions. Ask for a captions array of short strings.");
    captions = [...new Set(parsed.captions.map(c => c.trim()))].slice(0, run.requested_count);
  }
  return { raw, captions, system, user };
}

// Prompt Studio reuses this project's existing provider key. Only a superadmin's
// claimed, persisted run can call the provider; body-supplied prompts/URLs are ignored.
export async function handlePromptStudioGeneration(request, generate = requestPromptStep) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return Response.json({ error: "Sign in required." }, { status: 401 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle();
  if (profile?.is_superadmin !== true || user.app_metadata?.provider !== "google") return Response.json({ error: "Google superadmin access required." }, { status: 403 });
  let body; try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (!UUID.test(body?.requestId || "") || !UUID.test(body?.executionToken || "")) return Response.json({ error: "Invalid run." }, { status: 400 });
  const { data: run } = await supabase.from("generation_requests").select("*").eq("id", body.requestId).eq("profile_id", user.id).maybeSingle();
  if (!run || run.status !== "running" || run.execution_token !== body.executionToken || !run.steps_snapshot || Date.now()-Date.parse(run.execution_started_at) > 90000) return Response.json({ error: "No active execution lease for this run." }, { status: 409 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "Generation is not configured." }, { status: 503 });
  try { return Response.json(await generate(run)); }
  catch (error) { return Response.json({ error: error.message || "Generation failed." }, { status: 502 }); }
}
