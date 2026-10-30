// Test-only Auth/Storage HTTP fixture around REAL PostgreSQL + PostgREST.
// No production code imports this module; it never reads application credentials.
import { execFileSync, spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { generateForImage } from "../lib/generation.js";

const root = fileURLToPath(new URL("../", import.meta.url));
export const adminId = "10000000-0000-4000-8000-000000000001";
export const memberId = "10000000-0000-4000-8000-000000000002";
export const imageId = "00000000-0000-4000-8000-000000000001";
const secret = "local-admin-regression-only-secret-at-least-32-characters";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1WQAAAAASUVORK5CYII=", "base64");

function token(id) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role: id ? "authenticated" : "anon", sub: id, exp: Math.floor(Date.now() / 1000) + 86400 })).toString("base64url");
  const value = `${header}.${payload}`;
  return `${value}.${createHmac("sha256", secret).update(value).digest("base64url")}`;
}
async function port() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function startFixture({ appDirectory = root, cookieName = "sb-localhost-auth-token" } = {}) {
  const bin = process.env.PG_BINDIR || execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
  const directory = mkdtempSync(join(tmpdir(), "week7-admin-"));
  const data = join(directory, "data");
  const dbPort = await port(), restPort = await port();
  const container = `week7-${randomUUID()}`;
  let started = false, gateway, next;
  const sql = (input) => execFileSync(join(bin, "psql"), ["-X", "-h", directory, "-p", String(dbPort), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  async function close() {
    next?.kill();
    if (gateway) await new Promise((resolve) => gateway.close(resolve));
    try { execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" }); } catch {}
    if (started) execFileSync(join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    rmSync(directory, { recursive: true, force: true });
  }
  try {
    execFileSync(join(bin, "initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale"], { stdio: "pipe" });
    execFileSync(join(bin, "pg_ctl"), ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-k ${directory} -p ${dbPort} -h 127.0.0.1`, "-w", "start"], { stdio: "pipe" });
    started = true;
    sql(`create role anon nologin; create role authenticated nologin;
      create role authenticator login noinherit; grant anon, authenticated to authenticator;
      create schema auth; create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated,anon;
      grant select,insert,update,delete on storage.objects to authenticated;
      create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
      insert into auth.users values ('${adminId}','davidxionghl@gmail.com'),('${memberId}','member@example.test');`);
    for (const file of ["0001_captions_schema_and_seed.sql", "0002_profiles_and_auth_trigger.sql", "0003_profiles_bio.sql", "0004_caption_rating.sql", "0006_uploads_and_image_of_the_day.sql", "0008_caption_votes_policies.sql", "0009_admin_panel.sql", "0010_admin_observability.sql"]) {
      sql(readFileSync(join(root, "supabase/migrations", file), "utf8"));
    }
    execFileSync("docker", ["run", "--rm", "-d", "--name", container, "--network", "host",
      "-e", `PGRST_DB_URI=postgres://authenticator@127.0.0.1:${dbPort}/postgres`,
      "-e", "PGRST_DB_ANON_ROLE=anon", "-e", `PGRST_JWT_SECRET=${secret}`,
      "-e", `PGRST_SERVER_PORT=${restPort}`, "-e", "PGRST_SERVER_HOST=127.0.0.1", "postgrest/postgrest:v14.1"], { stdio: "pipe" });
    for (let i = 0; ; i++) {
      try { const result = await fetch(`http://127.0.0.1:${restPort}/`); if (result.ok) break; } catch {}
      if (i > 50) throw new Error("PostgREST did not start");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const files = new Map();
    const users = {
      [adminId]: { id: adminId, email: "davidxionghl@gmail.com", app_metadata: { provider: "google" }, user_metadata: {}, aud: "authenticated", role: "authenticated" },
      [memberId]: { id: memberId, email: "member@example.test", app_metadata: { provider: "google" }, user_metadata: {}, aud: "authenticated", role: "authenticated" },
    };
    gateway = createServer(async (req, res) => {
      try {
        res.setHeader("Access-Control-Allow-Origin", "http://localhost:3010");
        res.setHeader("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info,x-upsert,cache-control");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
        if (req.method === "OPTIONS") { res.end(); return; }
        const url = new URL(req.url, "http://localhost");
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        let uid;
        try { uid = JSON.parse(Buffer.from(req.headers.authorization?.split(".")[1] || "", "base64url")).sub; } catch {}
        const json = (value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
        if (url.pathname === "/sign-in") {
          const id = url.searchParams.get("role") === "member" ? memberId : adminId;
          const session = { access_token: token(id), refresh_token: "local-fixture", expires_at: Math.floor(Date.now()/1000)+86400, expires_in: 86400, token_type: "bearer", user: users[id] };
          res.setHeader("Set-Cookie", `${cookieName}=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}; Path=/; SameSite=Lax`);
          res.writeHead(302, { Location: "http://localhost:3010/admin" }); res.end(); return;
        }
        if (url.pathname === "/auth/v1/user") { json(users[uid] || { message: "Invalid token" }, users[uid] ? 200 : 401); return; }
        if (url.pathname === "/auth/v1/logout") { json({}); return; }
        if (url.pathname === "/api/admin/generate" && req.method === "POST") {
          if (uid !== adminId) { json({ error: "Admins only." }, 403); return; }
          const client = createClient(`http://localhost:${gateway.address().port}`, token(), {
            global: { headers: { Authorization: req.headers.authorization } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: image } = await client.from("images").select("id,url").eq("id", JSON.parse(body).imageId).single();
          if (!image) { json({ error: "Image not found." }, 404); return; }
          const result = await generateForImage(client, users[uid], image, true, {
            toDataUrl: async () => "data:image/png;base64,fixture",
            requestCaptions: async () => ({ raw: '{"captions":["Local standalone AI caption"]}', captions: ["Local standalone AI caption"] }),
          });
          json(result, result.error ? 502 : 200); return;
        }
        if (url.pathname.startsWith("/rest/v1/")) {
          const headers = { ...req.headers }; delete headers.host; delete headers["content-length"];
          const response = await fetch(`http://127.0.0.1:${restPort}/${req.url.slice(9)}`, { method: req.method, headers, ...(body.length ? { body } : {}) });
          res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
        }
        if (url.pathname === "/fixture.png") { res.setHeader("Content-Type", "image/png"); res.end(png); return; }
        if (url.pathname.startsWith("/storage/v1/object/public/uploads/")) {
          const stored = files.get(url.pathname.replace("/storage/v1/object/public/", ""));
          if (!stored) { json({ message: "Not found" }, 404); return; }
          res.setHeader("Content-Type", stored.type); res.end(stored.body); return;
        }
        if (url.pathname.startsWith("/storage/v1/object/uploads/") && req.method === "POST") {
          const path = url.pathname.replace("/storage/v1/object/", "");
          if (!users[uid] || !path.startsWith(`uploads/${uid}/`)) { json({ message: "Forbidden" }, 403); return; }
          const form = await new Response(body, { headers: { "content-type": req.headers["content-type"] } }).formData();
          const file = [...form.values()].find((value) => typeof value !== "string");
          files.set(path, { body: Buffer.from(await file.arrayBuffer()), type: file.type });
          json({ Key: path, Id: randomUUID() }); return;
        }
        if (url.pathname === "/storage/v1/object/uploads" && req.method === "DELETE") {
          if (uid !== adminId) { json({ message: "Forbidden" }, 403); return; }
          for (const path of JSON.parse(body).prefixes) files.delete(`uploads/${path}`);
          json([]); return;
        }
        json({ message: "Not found" }, 404);
      } catch (error) { res.writeHead(500); res.end(error.message); }
    });
    await new Promise((resolve) => gateway.listen(0, "127.0.0.1", resolve));
    const url = `http://localhost:${gateway.address().port}`;
    sql(`update public.images set url='${url}/fixture.png'; insert into public.terms(term,definition) select 'Example term '||n,'Local pagination fixture' from generate_series(1,27) n;`);
    return { url, key: token(), adminToken: token(adminId), memberToken: token(memberId), sql, close,
      startNext() {
        next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3010"], {
          cwd: appDirectory, stdio: "inherit", env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: token(), NEXT_PUBLIC_CAPTION_APP_URL: url, OPENAI_API_KEY: "" },
        });
        return next;
      },
    };
  } catch (error) { await close(); throw error; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await startFixture();
  console.log(`Local admin fixture: ${fixture.url}/sign-in`);
  console.log(`Local member fixture: ${fixture.url}/sign-in?role=member`);
  fixture.startNext();
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await fixture.close(); process.exit(); });
}
