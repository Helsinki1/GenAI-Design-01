# Caption Lab Admin

Standalone Next.js admin application. Deploy this directory as the Vercel **Root
Directory** of `gen-ai-design-01-admin`; the caption app remains at the repository
root in `gen-ai-design-01`. Each app installs and builds independently.

Run `npm ci`, copy `.env.example` to `.env.local`, then `npm run dev`.
Use the same Supabase URL and public anon key as the caption app. Never use a
service-role key. Generate with AI calls the caption app's `/api/admin/generate`
with the signed-in user's JWT. That endpoint verifies the admin flag, uses the
existing server-only OpenAI key, and writes through the user's RLS permissions.
The admin app never needs its own provider secret.

Google OAuth is already configured in the shared Supabase project. Its Google
client secret stays in Supabase. Add this app's exact production and deployment
`https://<hostname>/auth/callback` URLs to Supabase Authentication → URL
Configuration. The Google redirect URI remains the shared Supabase
`https://ikhquwsuspojxriybvts.supabase.co/auth/v1/callback` endpoint.

Disable Vercel deployment protection for assignment review. Google login and
`profiles.is_admin = true` are still required for every admin route and mutation;
the shared database's RLS policies enforce authorization independently. Members
see an access-denied page. Admin cookies have their own name, and sign-out revokes
only the admin session. The callback does not modify the caption app's profile.

The dashboard includes user/image/caption totals, voting trends, AI vs. handwritten
performance, voter activity, and popular images. `/admin` provides all Week 6 and
Week 7 resources listed in the repository README. The app includes the existing
admin implementation with its own entry points and authentication, without
requiring the caption app's source tree at build or runtime. Shared database
migrations remain in `../supabase/migrations`; migrations 0008–0010 are already
applied to GenAI-Design-1.

## Verification

`npm run build` verifies an independent production build. `npm test` starts a
disposable PostgreSQL/PostgREST fixture and the actual Next.js server to exercise
every route as anonymous, member, and admin, plus session isolation and callback
errors. PostgreSQL tools and Docker are required. `node tests/preview.mjs` starts
the same fixture for browser CRUD/upload checks at localhost:3010. Fixtures never
read production credentials. The repository's `npm run test:admin` additionally
verifies database CRUD, RLS and generation tracing; `npm run test:votes` covers
the voting regression. Stop the preview with Ctrl+C to remove the database.
