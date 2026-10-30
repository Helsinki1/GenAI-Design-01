import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { startFixture } from "../../tests/admin-fixture.mjs";
import { resources, getResource, validateResource } from "../lib/admin-resources.js";

test("standalone admin validates writable catalog inputs", () => {
  assert.equal(getResource("__proto__"), null);
  assert.deepEqual(validateResource(getResource("llm-providers"), { name: " Provider ", is_admin: true }), { name: "Provider" });
  for (const value of ["", -1, 1.5, 11]) assert.throws(() => validateResource(getResource("prompt-chain-mix"), { caption_count: value }));
  assert.throws(() => validateResource(getResource("images"), { url: "javascript:alert(1)" }));
});

test("standalone routes require an admin and ignore the caption app session", { timeout: 180_000 }, async (t) => {
  const fixture = await startFixture({
    appDirectory: fileURLToPath(new URL("../", import.meta.url)),
    cookieName: "sb-admin-localhost-auth-token",
  });
  t.after(() => fixture.close());
  fixture.startNext();
  const origin = "http://localhost:3010";
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(`${origin}/login`)).ok) break; } catch {}
    if (attempt > 100) throw new Error("Admin preview did not start");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const session = async (role) => (await fetch(`${fixture.url}/sign-in?role=${role}`, { redirect: "manual" })).headers.get("set-cookie").split(";")[0];
  const admin = await session("admin"), member = await session("member");
  const paths = ["/", "/admin", "/admin/users", "/admin/captions", "/admin/votes", ...Object.keys(resources).map((slug) => `/admin/${slug}`)];
  for (const path of paths) {
    const anonymous = await fetch(origin + path, { redirect: "manual" });
    assert.equal(anonymous.status, 307, path);
    assert.equal(new URL(anonymous.headers.get("location"), origin).pathname, "/login");
    const denied = await fetch(origin + path, { headers: { Cookie: member }, redirect: "manual" });
    assert.equal(denied.status, 307, path);
    assert.equal(new URL(denied.headers.get("location"), origin).pathname, "/access-denied");
    const allowed = await fetch(origin + path, { headers: { Cookie: admin } });
    assert.equal(allowed.status, 200, path);
    const body = await allowed.text();
    assert.match(body, /Caption Lab Admin/, path);
    assert.doesNotMatch(body, /Could not load|Sign in with Google|Admin access required/, path);
  }
  const denial = await fetch(`${origin}/login`, { headers: { Cookie: member } });
  assert.equal(new URL(denial.url).pathname, "/access-denied", "members must not enter a redirect loop");
  assert.match(await denial.text(), /Admin access required/);
  const otherApp = await fetch(`${origin}/admin`, { headers: { Cookie: admin.replace("sb-admin-localhost", "sb-localhost") }, redirect: "manual" });
  assert.equal(new URL(otherApp.headers.get("location"), origin).pathname, "/login", "caption app cookies must not authenticate this app");
  const callback = await fetch(`${origin}/auth/callback`, { redirect: "manual" });
  assert.equal(new URL(callback.headers.get("location"), origin).pathname, "/login");
});
