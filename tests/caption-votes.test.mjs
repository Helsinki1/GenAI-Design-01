import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Use a disposable PostgreSQL cluster, never a configured Supabase database.
const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("vote policies repair the production failure and preserve voter isolation", () => {
  const bin = process.env.PG_BINDIR || execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
  const directory = mkdtempSync(join(tmpdir(), "caption-votes-"));
  const data = join(directory, "data");
  let started = false;
  const sql = (input) => spawnSync(join(bin, "psql"), [
    "-X", "-h", directory, "-p", "5432", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
  ], { input, encoding: "utf8" });
  const success = (result) => assert.equal(result.status, 0, result.stderr);

  try {
    execFileSync(join(bin, "initdb"), ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale"], { stdio: "pipe" });
    execFileSync(join(bin, "pg_ctl"), ["-D", data, "-l", join(directory, "postgres.log"),
      "-o", `-k ${directory} -c listen_addresses=''`, "-w", "start"], { stdio: "pipe" });
    started = true;
    success(sql(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values
        ('10000000-0000-4000-8000-000000000001'),
        ('10000000-0000-4000-8000-000000000002');
      ${read("supabase/migrations/0001_captions_schema_and_seed.sql")}
      ${read("supabase/migrations/0004_caption_rating.sql")}
      -- Live incident: schema/grants exist, RLS enabled, zero policies.
      alter table public.caption_votes enable row level security;
    `));

    const regression = read("supabase/tests/caption_votes.sql");
    const broken = sql(regression);
    assert.notEqual(broken.status, 0, "The regression must fail without vote policies");
    assert.match(broken.stderr, /42501: new row violates row-level security policy for table "caption_votes"/);

    success(sql(read("supabase/migrations/0008_caption_votes_policies.sql")));
    success(sql(regression));
    // Manual rollout can safely be repeated without losing votes or policies.
    success(sql(read("supabase/migrations/0008_caption_votes_policies.sql")));
    success(sql(regression));
  } finally {
    if (started) execFileSync(join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    rmSync(directory, { recursive: true, force: true });
  }
});
