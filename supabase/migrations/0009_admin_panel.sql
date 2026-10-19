-- Admin area: profiles.is_admin gates /admin and the admin-only writes below.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Bootstrap: these two accounts are admins, everyone else is not.
update public.profiles
set is_admin = lower(email) in ('davidxionghl@gmail.com', 'yx2948@columbia.edu');

-- New accounts start as non-admins, except the two bootstrap emails (so they are
-- admins even if they sign up after this migration runs).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, is_admin)
  values (
    new.id,
    new.email,
    lower(new.email) in ('davidxionghl@gmail.com', 'yx2948@columbia.edu')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- True when the signed-in user's profile has is_admin set. Security definer so
-- policies can call it without the caller needing to read profiles themselves.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select is_admin from public.profiles where id = (select auth.uid())),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Profiles: users may read every profile but only edit their own, and never
-- is_admin. Column-level grants keep anyone from promoting themselves.
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, bio, avatar_url, image_of_the_day_id, updated_at)
  on public.profiles to authenticated;

drop policy if exists "Signed-in users can read profiles" on public.profiles;
create policy "Signed-in users can read profiles"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Captions (the AI-generated media): anyone can read, signed-in users can add
-- their own, and only admins can edit or delete.
alter table public.captions enable row level security;
revoke all on public.captions from anon, authenticated;
grant select on public.captions to anon, authenticated;
grant insert, update, delete on public.captions to authenticated;

drop policy if exists "Anyone can read captions" on public.captions;
create policy "Anyone can read captions"
  on public.captions for select to anon, authenticated
  using (true);

drop policy if exists "Users can add their own captions" on public.captions;
create policy "Users can add their own captions"
  on public.captions for insert to authenticated
  with check (created_by = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Admins can edit captions" on public.captions;
create policy "Admins can edit captions"
  on public.captions for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete captions" on public.captions;
create policy "Admins can delete captions"
  on public.captions for delete to authenticated
  using ((select public.is_admin()));

-- Images: anyone can read, signed-in users can add their own uploads.
alter table public.images enable row level security;
revoke all on public.images from anon, authenticated;
grant select on public.images to anon, authenticated;
grant insert on public.images to authenticated;

drop policy if exists "Anyone can read images" on public.images;
create policy "Anyone can read images"
  on public.images for select to anon, authenticated
  using (true);

drop policy if exists "Users can add their own images" on public.images;
create policy "Users can add their own images"
  on public.images for insert to authenticated
  with check (created_by = (select auth.uid()));

-- Votes already have per-user policies (0008); just make sure anon has nothing.
revoke all on public.caption_votes from anon;
