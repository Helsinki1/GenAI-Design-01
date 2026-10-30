import { requestCaptions, toDataUrl } from "./generation-provider.js";

function checked(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

// The same user JWT writes captions and traces. Dependencies are injectable for
// tests so provider failures can be exercised without paid API calls.
export async function generateForImage(supabase, user, image, single, dependencies = {}) {
  const generate = dependencies.requestCaptions || requestCaptions;
  const loadImage = dependencies.toDataUrl || toDataUrl;
  let request;
  try {
    request = checked(await supabase.from("generation_requests").insert({ profile_id: user.id, image_id: image.id }).select("id").single());
    let mix = checked(await supabase.from("prompt_chain_mix").select("chain_id,caption_count").gt("caption_count", 0).order("id"));
    if (!mix.length) throw new Error("No prompt chains are enabled. An admin must set a positive caption count in Prompt chain mix.");
    if (single) {
      let pick = Math.random() * mix.reduce((sum, entry) => sum + entry.caption_count, 0);
      const chosen = mix.find((entry) => (pick -= entry.caption_count) < 0) || mix[0];
      mix = [{ ...chosen, caption_count: 1 }];
    }
    const dataUrl = await loadImage(image.url);
    const rows = [];
    for (const entry of mix) {
      const steps = checked(await supabase.from("prompt_chain_steps").select("*,llm_models(provider_model_id,provider_id)").eq("chain_id", entry.chain_id).order("position"));
      if (!steps.length) throw new Error("The selected prompt chain has no steps.");
      let previous = "";
      let captions = [];
      let finalModel;
      for (const step of steps) {
        // Provider display names are editable; dispatch uses the seeded identity.
        if (step.llm_models.provider_id !== "70000000-0000-4000-8000-000000000001") throw new Error("This caption app currently supports OpenAI generation only.");
        const model = process.env.OPENAI_MODEL || step.llm_models.provider_model_id;
        const prompts = { system: step.system_prompt, user: step.user_prompt.replaceAll("{{count}}", String(entry.caption_count)) + (previous ? `\nPrevious step: ${previous}` : "") };
        const started = Date.now();
        let result;
        let providerError;
        try { result = await generate(dataUrl, model, entry.caption_count, prompts); }
        catch (error) { providerError = error.message || "Provider request failed."; }
        checked(await supabase.from("llm_responses").insert({
          request_id: request.id, step_id: step.id, model,
          system_prompt: prompts.system, user_prompt: prompts.user,
          response: result?.raw ?? null, error: providerError ?? null, duration_ms: Date.now() - started,
        }).select("id").single());
        if (providerError) throw new Error(providerError);
        previous = result.raw;
        captions = result.captions;
        finalModel = model;
      }
      rows.push(...captions.map((content) => ({ content, image_id: image.id, model: finalModel, created_by: user.id, generation_request_id: request.id })));
    }
    checked(await supabase.from("captions").insert(rows).select("id"));
    checked(await supabase.from("generation_requests").update({ status: "succeeded", caption_count: rows.length, completed_at: new Date().toISOString() }).eq("id", request.id).select("id").single());
    return { error: null, requestId: request.id, captionCount: rows.length };
  } catch (error) {
    if (request) {
      const completed = await supabase.from("generation_requests").update({ status: "failed", error: error.message, completed_at: new Date().toISOString() }).eq("id", request.id).select("id").single();
      if (completed.error) return { error: `${error.message} Request status could not be saved: ${completed.error.message}` };
    }
    return { error: error.message };
  }
}
