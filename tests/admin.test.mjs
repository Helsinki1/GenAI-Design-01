import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { startFixture, adminId, memberId, imageId } from "./admin-fixture.mjs";
import { getResource, validateResource } from "../lib/admin-resources.js";
import { generateForImage } from "../lib/generation.js";
import { handleAdminGeneration } from "../lib/admin-generation.js";

test("resource validation rejects forged fields and invalid values", () => {
  assert.equal(getResource("__proto__"), null);
  assert.deepEqual(validateResource(getResource("llm-providers"), { name: " Sample ", is_admin: true }), { name: "Sample" });
  for (const value of ["", -1, 1.5, "NaN", 11]) assert.throws(() => validateResource(getResource("prompt-chain-mix"), { caption_count: value }));
  assert.throws(() => validateResource(getResource("images"), { url: "javascript:alert(1)" }));
  assert.throws(() => validateResource(getResource("signup-domains"), { domain: "https://example.com" }));
  assert.deepEqual(validateResource(getResource("whitelisted-emails"), { email: " A@Example.COM " }), { email: "a@example.com" });
});

test("shared generation endpoint rejects anonymous/member callers and uses the admin JWT", async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());
  const values = { NEXT_PUBLIC_SUPABASE_URL: fixture.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: fixture.key, OPENAI_API_KEY: "test-only" };
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const request = (token, body = { imageId }) => new Request("http://localhost/api/admin/generate", {
    method: "POST", headers: token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {}, body: JSON.stringify(body),
  });
  const neverGenerate = () => { throw new Error("Unauthorized provider call"); };
  assert.equal((await handleAdminGeneration(request(), neverGenerate)).status, 401);
  assert.equal((await handleAdminGeneration(request("invalid"), neverGenerate)).status, 401);
  assert.equal((await handleAdminGeneration(request(fixture.memberToken), neverGenerate)).status, 403);
  assert.equal((await handleAdminGeneration(request(fixture.adminToken, { imageId: "invalid" }), neverGenerate)).status, 400);
  const response = await handleAdminGeneration(request(fixture.adminToken), (supabase, user, image, single) => {
    assert.equal(user.id, adminId);
    assert.equal(single, true);
    return generateForImage(supabase, user, image, single, {
      toDataUrl: async () => "data:image/png;base64,fixture",
      requestCaptions: async () => ({ raw: '{"captions":["Shared admin generation"]}', captions: ["Shared admin generation"] }),
    });
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.error, null);
  assert.equal(result.captionCount, 1);
  const admin = createClient(fixture.url, fixture.key, { global: { headers: { Authorization: `Bearer ${fixture.adminToken}` } }, auth: { persistSession: false } });
  const saved = await admin.from("captions").select("created_by,content").eq("generation_request_id", result.requestId).single();
  assert.equal(saved.error, null);
  assert.equal(saved.data.created_by, adminId);
  assert.equal(saved.data.content, "Shared admin generation");
});

test("Week 7 database CRUD, isolation, and actual generation telemetry", async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.close());
  const client = (token) => createClient(fixture.url, fixture.key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = client(fixture.adminToken), member = client(fixture.memberToken), anon = client(fixture.key);
  const ok = (result) => { assert.equal(result.error, null, result.error?.message); return result.data; };
  const providers = ok(await admin.from("llm_providers").select("id"));
  const cases = {
    terms: { term: "Regression term", definition: "Definition", example: "Example", priority: 1 },
    ai_generation_examples: { image_description: "A cat", caption: "Monday again", explanation: "Relatable", priority: 1 },
    llm_models: { name: "Test model", provider_id: providers[0].id, provider_model_id: "test-model", is_temperature_supported: false },
    llm_providers: { name: "Test provider" },
    allowed_signup_domains: { domain: "example.test" },
    whitelisted_emails: { email: "qa@example.test" },
    images: { url: `${fixture.url}/fixture.png`, created_by: adminId },
  };
  for (const [table, payload] of Object.entries(cases)) {
    const row = ok(await admin.from(table).insert(payload).select().single());
    const field = Object.keys(payload)[0];
    const changed = table === "allowed_signup_domains" ? "edited.example.test" : table === "whitelisted_emails" ? "edited@example.test" : table === "images" ? `${payload.url}?edited` : `${payload[field]} edited`;
    ok(await admin.from(table).update({ [field]: changed }).eq("id", row.id).select().single());
    assert.equal(ok(await admin.from(table).select().eq("id", row.id).single())[field], changed);
    const forbidden = await member.from(table).delete().eq("id", row.id).select("id");
    assert.ok(forbidden.error || forbidden.data.length === 0, `${table} permits member deletion`);
    const memberUpdate = await member.from(table).update({ [field]: payload[field] }).eq("id", row.id).select("id");
    assert.ok(memberUpdate.error || memberUpdate.data.length === 0, `${table} permits member update`);
    if (table !== "images") assert.ok((await member.from(table).insert(payload).select()).error, `${table} permits member insert`);
    assert.ok((await anon.from(table).insert(payload)).error, `${table} permits anonymous insert`);
    ok(await admin.from(table).delete().eq("id", row.id).select().single());
    assert.equal(ok(await admin.from(table).select("id").eq("id", row.id)).length, 0);
    assert.ok((await admin.from(table).delete().eq("id", row.id).select().single()).error, "A no-op deletion must not report success");
  }
  for (const table of ["prompt_chains", "prompt_chain_steps", "prompt_chain_mix"]) {
    assert.ok(ok(await admin.from(table).select("*")).length);
    assert.ok((await anon.from(table).select()).error);
  }
  const mix = ok(await admin.from("prompt_chain_mix").select().single());
  ok(await admin.from("prompt_chain_mix").update({ caption_count: 2 }).eq("id", mix.id).select().single());
  assert.equal(ok(await member.from("prompt_chain_mix").update({ caption_count: 9 }).eq("id", mix.id).select()).length, 0);
  assert.ok((await admin.from("prompt_chain_mix").update({ caption_count: -1 }).eq("id", mix.id)).error);
  assert.ok((await admin.from("llm_models").delete().eq("id", "70000000-0000-4000-8000-000000000002")).error, "Referenced models must not be deleted");
  const dependencies = { toDataUrl: async () => "data:image/png;base64,fixture", requestCaptions: async (_url, _model, count) => ({ raw: JSON.stringify({ captions: Array(count).fill("Test generated caption") }), captions: Array(count).fill("Test generated caption") }) };
  const result = await generateForImage(member, { id: memberId }, { id: imageId, url: "unused" }, false, dependencies);
  assert.equal(result.error, null); assert.equal(result.captionCount, 2);
  const request = ok(await admin.from("generation_requests").select().eq("id", result.requestId).single());
  assert.equal(request.status, "succeeded"); assert.equal(request.caption_count, 2); assert.ok(request.completed_at);
  const trace = ok(await admin.from("llm_responses").select().eq("request_id", result.requestId).single());
  assert.ok(trace.response.includes("Test generated caption")); assert.ok(trace.duration_ms >= 0); assert.match(trace.user_prompt, /2 different/);
  const media = ok(await admin.from("captions").select("*,images(url)").eq("generation_request_id", result.requestId));
  assert.equal(media.length, 2); assert.ok(media[0].images.url);
  const failed = await generateForImage(member, { id: memberId }, { id: imageId, url: "unused" }, true, { ...dependencies, requestCaptions: async () => { throw new Error("Provider unavailable"); } });
  assert.match(failed.error, /Provider unavailable/);
  assert.equal(ok(await admin.from("generation_requests").select().eq("status", "failed")).length, 1);
  assert.equal(ok(await admin.from("llm_responses").select().eq("error", "Provider unavailable")).length, 1);
  const privateRequest = ok(await admin.from("generation_requests").insert({ profile_id: adminId, image_id: imageId }).select().single());
  assert.equal(ok(await member.from("generation_requests").select().eq("id", privateRequest.id)).length, 0);
  assert.ok((await member.from("llm_responses").insert({ request_id: privateRequest.id, model: "fake", system_prompt: "x", user_prompt: "x", duration_ms: 1 })).error);
  assert.equal(ok(await member.from("allowed_signup_domains").select()).length, 0);
  ok(await admin.from("prompt_chain_mix").update({ caption_count: 0 }).eq("id", mix.id));
  assert.match((await generateForImage(member, { id: memberId }, { id: imageId }, true, dependencies)).error, /No prompt chains/);
});
