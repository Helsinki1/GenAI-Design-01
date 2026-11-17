import assert from "node:assert/strict";
import { test } from "node:test";

for (const route of ["../app/api/auth/health/route.js","../admin-app/app/api/auth/health/route.js"]) {
  const { GET } = await import(route);
  test(`${route}: auth health fails safely for a paused backend or disabled provider`, async t => {
    const mock=t.mock.method(globalThis,"fetch",async()=>Response.json({external:{google:true}}));
    let response=await GET();
    assert.equal(response.status,200); assert.deepEqual(await response.json(),{available:true});
    assert.equal(response.headers.get("cache-control"),"no-store");
    const options=mock.mock.calls[0].arguments[1];
    assert.equal(options.cache,"no-store"); assert.ok(options.signal instanceof AbortSignal);
    for (const implementation of [async()=>{throw new Error("DNS unavailable")},async()=>new Response("unavailable",{status:503}),async()=>Response.json({external:{google:false}}),async()=>new Response("invalid JSON")]) {
      mock.mock.mockImplementation(implementation);
      response=await GET(); assert.equal(response.status,503); assert.deepEqual(await response.json(),{available:false});
    }
  });
}
