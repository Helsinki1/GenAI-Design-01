-- Run through npm run test:votes against its disposable PostgreSQL fixtures.
begin;

create function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$
begin
  if ok is distinct from true then raise exception '%', message; end if;
end;
$$;

select set_config('test.caption_id', (select id::text from public.captions limit 1), true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
set local role authenticated;

-- The first click used to fail here with SQLSTATE 42501 in production.
insert into public.caption_votes (caption_id, user_id, vote_value)
values (current_setting('test.caption_id')::uuid, auth.uid(), 1);
select pg_temp.assert_true(
  (select count(*) = 1 and min(vote_value) = 1 from public.caption_votes),
  'Upvote must persist and be readable');

-- Switch, then click the selected downvote again to remove it.
update public.caption_votes set vote_value = -1 where user_id = auth.uid();
select pg_temp.assert_true(
  (select count(*) = 1 and min(vote_value) = -1 from public.caption_votes),
  'Switching to downvote must persist');
delete from public.caption_votes where user_id = auth.uid();
select pg_temp.assert_true((select count(*) = 0 from public.caption_votes), 'Toggle must remove vote');

insert into public.caption_votes (caption_id, user_id, vote_value)
values (current_setting('test.caption_id')::uuid, auth.uid(), -1);
update public.caption_votes set vote_value = 1 where user_id = auth.uid();
select pg_temp.assert_true(
  (select count(*) = 1 and min(vote_value) = 1 from public.caption_votes),
  'Switching from downvote to upvote must persist');
delete from public.caption_votes where user_id = auth.uid();
select pg_temp.assert_true((select count(*) = 0 from public.caption_votes), 'Upvote toggle must remove vote');
insert into public.caption_votes (caption_id, user_id, vote_value)
values (current_setting('test.caption_id')::uuid, auth.uid(), 1);

-- A second signed-in user (including the admin reader) must see both counts.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
insert into public.caption_votes (caption_id, user_id, vote_value)
values (current_setting('test.caption_id')::uuid, auth.uid(), -1);
select pg_temp.assert_true(
  (select count(*) filter (where vote_value = 1) = 1
      and count(*) filter (where vote_value = -1) = 1 from public.caption_votes),
  'Admin/gallery counts must include both users');

do $$
declare affected integer;
begin
  update public.caption_votes set vote_value = -1 where user_id <> auth.uid();
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected = 0, 'Cannot update another user vote');
  delete from public.caption_votes where user_id <> auth.uid();
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected = 0, 'Cannot delete another user vote');
  begin
    insert into public.caption_votes (caption_id, user_id, vote_value)
    values (current_setting('test.caption_id')::uuid, '10000000-0000-4000-8000-000000000001', -1);
    raise exception 'Cannot impersonate another voter';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.caption_votes set user_id = '10000000-0000-4000-8000-000000000001'
    where user_id = auth.uid();
    raise exception 'Cannot transfer vote ownership';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform * from public.caption_votes;
    raise exception 'Anonymous users cannot read votes';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.caption_votes (caption_id, user_id, vote_value)
    values (current_setting('test.caption_id')::uuid, '10000000-0000-4000-8000-000000000001', 1);
    raise exception 'Anonymous users cannot vote';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
