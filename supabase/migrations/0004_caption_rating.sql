-- AI-generated captions live in public.captions alongside the seeded ones.
alter table public.captions
  add column if not exists model text,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

grant insert on public.captions to authenticated;

-- One row per user per caption; vote_value is 1 (upvote) or -1 (downvote).
create table if not exists public.caption_votes (
  id uuid primary key default gen_random_uuid(),
  caption_id uuid not null references public.captions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  vote_value smallint not null check (vote_value in (-1, 1)),
  created_datetime_utc timestamptz not null default now(),
  modified_datetime_utc timestamptz not null default now(),
  unique (caption_id, user_id)
);

create index if not exists caption_votes_caption_idx on public.caption_votes (caption_id);

grant select, insert, update, delete on public.caption_votes to authenticated;
