-- Short free-text bio shown and edited on /profile/[id].
alter table public.profiles add column if not exists bio text;
