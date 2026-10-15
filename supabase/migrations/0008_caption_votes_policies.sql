-- caption_votes has RLS on but no policies, so every vote insert was rejected
-- and every read came back empty. Signed-in users can see all votes (for the
-- counts) but can only create, change, or remove their own.
alter table public.caption_votes enable row level security;
grant select, insert, update, delete on public.caption_votes to authenticated;

drop policy if exists "Signed-in users can read votes" on public.caption_votes;
create policy "Signed-in users can read votes"
  on public.caption_votes for select to authenticated
  using (true);

drop policy if exists "Users can add their own votes" on public.caption_votes;
create policy "Users can add their own votes"
  on public.caption_votes for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can change their own votes" on public.caption_votes;
create policy "Users can change their own votes"
  on public.caption_votes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can remove their own votes" on public.caption_votes;
create policy "Users can remove their own votes"
  on public.caption_votes for delete to authenticated
  using (user_id = (select auth.uid()));
