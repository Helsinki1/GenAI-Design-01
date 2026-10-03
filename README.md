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
