# GenAI Design

A Next.js caption gallery backed by Supabase.

## Run locally

1. Install Node.js.
2. Install dependencies with `npm install`.
3. Start the dev server with `npm run dev`.

## Supabase setup

1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL`.
3. Set `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Never commit `.env.local`. Add the same variables to the Vercel project before
deploying the `main` branch.

Apply the SQL files in `supabase/migrations/` in numeric order in the Supabase
SQL editor. Pushing application code does not apply database migrations.
In particular, `0008_caption_votes_policies.sql` is required for voting: with
RLS enabled but no policies, every vote insert is rejected and vote counts read
as zero. It is safe to rerun this migration on an existing database.

### Voting regression test

Run `npm run test:votes` with PostgreSQL server tools installed (`pg_config`,
`initdb`, `pg_ctl`, and `psql`; use `PG_BINDIR` if they are not discoverable).
Run as a non-root user. The test starts an isolated temporary database with no
TCP listener and never reads application credentials. It reproduces the missing
policies failure, applies migration 0008, and verifies upvotes, downvotes,
switching, removal, shared counts, and protection against other-user/anonymous
writes. The temporary cluster is removed afterward.

## Admin area

`/admin` (stats dashboard, users, captions, votes) is only for signed-in users
whose `profiles.is_admin` is `true`. The proxy redirects everyone else, and every
admin page and server action re-checks the flag. Database policies also allow
caption edits and deletes only for admins, and users can't change `is_admin`
on their own profile.

Run `supabase/migrations/0009_admin_panel.sql` in the Supabase SQL editor to add
the column. To avoid locking yourself out, the migration seeds the first admins
directly in SQL (the SQL editor runs as the database owner, so it isn't bound by
the app's rules). It sets `is_admin` for `davidxionghl@gmail.com` and
`yx2948@columbia.edu`, and the sign-up trigger gives those two emails admin on
first sign-in. Every other account starts with `is_admin = false`.

## Week 7 observability

Apply `0010_admin_observability.sql` **before deploying this application change**.
It is transactional and requires migrations 0001–0009. It adds the missing
catalog/trace tables, seeds the existing OpenAI caption prompt and default model,
and enables RLS. Existing admin accounts retain their roles; no service-role key
is used. The previous week's voting fix remains covered by `npm run test:votes`.

Applied to GenAI-Design-1 on 2026-10-30. Verified all 11 new tables have RLS,
the default mix is three captions, and live rollback-only checks pass for admin
CRUD, image CRUD, mix updates, generation logs, and member isolation.

| Admin route | Operations |
| --- | --- |
| `/admin/users` | Read profiles and activity |
| `/admin/prompt-chains` | Read chains and full details |
| `/admin/prompt-chain-steps` | Read ordered prompts and model references |
| `/admin/prompt-chain-mix` | Read/update caption counts (0 disables a chain) |
| `/admin/terms` | Create/read/update/delete terms |
| `/admin/media` | View AI captions with their complete source image |
| `/admin/generation-requests` | Read status, user/image, counts, errors, timestamps |
| `/admin/generation-examples` | Create/read/update/delete examples |
| `/admin/llm-models` | Create/read/update/delete models; provider selector |
| `/admin/llm-providers` | Create/read/update/delete providers |
| `/admin/llm-responses` | Read full prompts/output, model, timing and failures |
| `/admin/signup-domains` | Create/read/update/delete domain registry entries |
| `/admin/whitelisted-emails` | Create/read/update/delete e-mail registry entries |
| `/admin/images` | Upload or register URLs, read/view/update/delete records |

Every mutation checks the admin session again, validates only allowlisted fields,
and requires a returned database row before displaying success. RLS separately
restricts catalog writes to existing admins. Requests/responses are readable by
their owner and admins. Reference constraints prevent deleting a model/provider
that is still used. New catalog lists paginate on the server; full record details
remain available even when the table preview is shortened.

New caption generations record request and response history using the user's JWT.
Uploads generate the count configured for each enabled chain; the single-caption
button samples one enabled chain by those counts. The initial chain matches the
previous prompt and three-caption upload behavior. `OPENAI_MODEL`, if set, still
overrides the step's model. The execution adapter supports OpenAI; other providers
can be cataloged but require a future adapter to execute. Historical captions do
not gain fabricated request logs. Domain/e-mail registries are managed here;
this release does not change the existing Supabase OAuth signup policy.

Deleting an image removes its database record and unlinks existing captions;
it preserves shared storage assets. Failed admin image registration attempts
clean up the new file when permitted. Uploads accept JPEG/PNG/WebP/GIF up to 10 MB.

### Local verification

`npm run test:admin` requires PostgreSQL server tools (or `PG_BINDIR`) and Docker.
It creates a disposable PostgreSQL cluster and runs PostgREST v14.1 on loopback.
Tests use the real Supabase SDK and SQL migrations, verify every writable
resource, RLS isolation, reference errors, mix behavior, and generation telemetry.
Provider output is controlled; tests never use production credentials or call a
paid model API. Auth and storage HTTP endpoints are local fixtures.

`npm run preview:admin` starts the same isolated database plus Next.js at
`http://localhost:3010`. Open the printed `/sign-in` URL for the fixture admin;
append `?role=member` to test denial. The fixture is a separate loopback server,
not an authentication bypass in the deployed app. Stop with Ctrl+C to remove
the temporary database and PostgREST container.

### Separate Vercel applications

The existing `gen-ai-design-01` Vercel project uses the repository root. The
dedicated `gen-ai-design-01-admin` project uses **`admin-app` as its Root
Directory**. Both deploy `main`, have independent packages/builds, and share the
GenAI-Design-1 Supabase database. The original `/admin` routes remain available.
See [admin-app/README.md](admin-app/README.md) for setup and verification. Use each
project's commit-specific deployment URL for review; Supabase's redirect
allowlist must contain both HTTPS `/auth/callback` URLs.

The caption app's `POST /api/admin/generate` lets the standalone admin generate
captions with the existing provider key. It validates a Supabase bearer JWT and
`profiles.is_admin` before loading an image or calling the provider, then uses
that user's JWT for RLS-protected generation/trace writes. It accepts no supplied
image URL, prompt, provider key, or role. Anonymous and member calls are denied.

Vercel deployment protection is off for assignment review. Application login
and admin authorization remain required. Apply migration 0010 before deploying
this release to a new database.
