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
