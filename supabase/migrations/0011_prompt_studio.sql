-- Run after GenAI-Design-01 migrations 0001–0010. All RPCs retain the caller's RLS.
begin;

alter table public.profiles add column is_superadmin boolean not null default false;
-- Bootstrap only the existing, verified project owner. No email bypass at runtime.
update public.profiles p set is_superadmin = true
from auth.users u where u.id = p.id and lower(u.email) = 'davidxionghl@gmail.com' and p.is_admin;
create function public.is_superadmin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_superadmin from public.profiles where id = (select auth.uid())), false)
$$;
revoke all on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;
-- Existing profile column grants exclude both role flags.

alter table public.prompt_chains add column revision integer not null default 1;
alter table public.prompt_chains add column updated_at timestamptz not null default now();
alter table public.prompt_chain_steps add column title text not null default 'Generate captions';
alter table public.prompt_chain_steps add column include_image boolean not null default true;
alter table public.prompt_chain_steps add column output_kind text not null default 'captions' check (output_kind in ('text','captions'));
alter table public.prompt_chain_steps drop constraint prompt_chain_steps_chain_id_position_key;
alter table public.prompt_chain_steps add constraint prompt_chain_steps_chain_id_position_key unique(chain_id,position) deferrable initially deferred;
alter table public.prompt_chain_steps drop constraint prompt_chain_steps_chain_id_fkey;
alter table public.prompt_chain_steps add foreign key (chain_id) references public.prompt_chains(id) on delete cascade;
alter table public.prompt_chain_mix drop constraint prompt_chain_mix_chain_id_fkey;
alter table public.prompt_chain_mix add foreign key (chain_id) references public.prompt_chains(id) on delete cascade;
alter table public.llm_responses drop constraint llm_responses_step_id_fkey;
alter table public.llm_responses add foreign key (step_id) references public.prompt_chain_steps(id) on delete set null;

grant insert,update,delete on public.prompt_chains,public.prompt_chain_steps to authenticated;
create policy "Superadmins manage chains" on public.prompt_chains for all to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
create policy "Superadmins manage steps" on public.prompt_chain_steps for all to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
grant delete on public.prompt_chain_mix to authenticated;
create policy "Superadmins remove mix" on public.prompt_chain_mix for delete to authenticated using ((select public.is_superadmin()));

alter table public.generation_requests
  add column prompt_chain_id uuid references public.prompt_chains(id) on delete set null,
  add column chain_name text,
  add column steps_snapshot jsonb,
  add column source_image_url text,
  add column requested_count integer check (requested_count between 1 and 10),
  add column step_outputs jsonb not null default '[]'::jsonb,
  add column execution_token uuid,
  add column execution_started_at timestamptz;
create index on public.generation_requests(prompt_chain_id,created_at desc);
create policy "Superadmins read requests" on public.generation_requests for select to authenticated using ((select public.is_superadmin()));
create policy "Superadmins read responses" on public.llm_responses for select to authenticated using ((select public.is_superadmin()));

-- One transaction handles create/update/delete/reorder of steps; revision catches stale tabs.
create function public.save_prompt_chain(p_id uuid, p_name text, p_description text, p_revision integer, p_steps jsonb)
returns public.prompt_chains language plpgsql security invoker set search_path = '' as $$
declare c public.prompt_chains; s jsonb; n integer := 0; ids uuid[] := '{}';
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required' using errcode='42501'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 100 or length(coalesce(p_description,'')) > 500
    or p_revision is null or p_revision < 0 or p_steps is null or jsonb_typeof(p_steps) <> 'array'
    or jsonb_array_length(p_steps) > 8 then raise exception 'Invalid chain'; end if;
  select * into c from public.prompt_chains where id=p_id for update;
  if found then
    if c.revision <> p_revision then raise exception 'This chain changed in another tab. Reload before saving.'; end if;
    update public.prompt_chains set name=trim(p_name), description=coalesce(p_description,''), revision=revision+1, updated_at=now() where id=p_id returning * into c;
  else
    if p_revision <> 0 then raise exception 'Chain no longer exists. Reload the page.'; end if;
    insert into public.prompt_chains(id,name,description) values(p_id,trim(p_name),coalesce(p_description,'')) returning * into c;
  end if;
  for s in select value from jsonb_array_elements(p_steps) loop
    n := n+1;
    if s->>'id' is null or (s->>'id')::uuid = any(ids) or length(trim(coalesce(s->>'title',''))) not between 1 and 100
      or length(trim(coalesce(s->>'system_prompt',''))) not between 1 and 8000
      or length(trim(coalesce(s->>'user_prompt',''))) not between 1 and 8000
      or coalesce(s->>'output_kind','') not in ('text','captions') or jsonb_typeof(s->'include_image') is distinct from 'boolean'
      then raise exception 'Invalid or duplicate step'; end if;
    if not exists (select 1 from public.llm_models where id=(s->>'model_id')::uuid and provider_id='70000000-0000-4000-8000-000000000001') then raise exception 'Choose an available OpenAI model'; end if;
    if exists (select 1 from public.prompt_chain_steps where id=(s->>'id')::uuid and chain_id<>p_id) then raise exception 'Step belongs to another chain'; end if;
    ids := array_append(ids,(s->>'id')::uuid);
    update public.prompt_chain_steps set model_id=(s->>'model_id')::uuid,position=n,title=trim(s->>'title'),
      system_prompt=trim(s->>'system_prompt'),user_prompt=trim(s->>'user_prompt'),include_image=(s->>'include_image')::boolean,output_kind=s->>'output_kind'
      where id=(s->>'id')::uuid and chain_id=p_id;
    if not found then
      insert into public.prompt_chain_steps(id,chain_id,model_id,position,title,system_prompt,user_prompt,include_image,output_kind)
        values((s->>'id')::uuid,p_id,(s->>'model_id')::uuid,n,trim(s->>'title'),trim(s->>'system_prompt'),trim(s->>'user_prompt'),(s->>'include_image')::boolean,s->>'output_kind');
    end if;
  end loop;
  delete from public.prompt_chain_steps where chain_id=p_id and not(id=any(ids));
  return c;
end $$;

create function public.delete_prompt_chain(p_id uuid,p_revision integer) returns void language plpgsql security invoker set search_path='' as $$
declare c public.prompt_chains;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required' using errcode='42501'; end if;
  select * into c from public.prompt_chains where id=p_id for update;
  if not found or c.revision <> p_revision then raise exception 'Chain changed or no longer exists. Reload the page.'; end if;
  if exists(select 1 from public.prompt_chain_mix where chain_id=p_id and caption_count>0) then
    raise exception 'This chain is enabled in the caption app. Set its mix count to 0 in the admin app before deleting it.';
  end if;
  delete from public.prompt_chains where id=p_id;
end $$;

create function public.start_prompt_chain_run(p_id uuid,p_chain_id uuid,p_image_id uuid,p_count integer)
returns public.generation_requests language plpgsql security invoker set search_path='' as $$
declare c public.prompt_chains; r public.generation_requests; snapshot jsonb; image_url text;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required' using errcode='42501'; end if;
  if p_count is null or p_count not between 1 and 10 then raise exception 'Choose 1–10 captions'; end if;
  select * into r from public.generation_requests where id=p_id;
  if found then
    if r.profile_id=auth.uid() and r.prompt_chain_id=p_chain_id and r.image_id=p_image_id and r.requested_count=p_count then return r; end if;
    raise exception 'Run ID already used';
  end if;
  select * into c from public.prompt_chains where id=p_chain_id for share;
  if not found then raise exception 'Chain not found'; end if;
  select url into image_url from public.images where id=p_image_id;
  if not found then raise exception 'Choose an existing image'; end if;
  select jsonb_agg(to_jsonb(s)||jsonb_build_object('model',m.provider_model_id,'provider_id',m.provider_id) order by s.position)
    into snapshot from public.prompt_chain_steps s join public.llm_models m on m.id=s.model_id where s.chain_id=p_chain_id;
  if snapshot is null or jsonb_array_length(snapshot) not between 1 and 8 then raise exception 'Add 1–8 steps before running'; end if;
  if snapshot->(jsonb_array_length(snapshot)-1)->>'output_kind' <> 'captions' then raise exception 'The final step must output captions'; end if;
  if not exists(select 1 from jsonb_array_elements(snapshot) s where (s->>'include_image')::boolean) then raise exception 'At least one step must receive the image'; end if;
  if exists(select 1 from jsonb_array_elements(snapshot) s where s->>'provider_id' <> '70000000-0000-4000-8000-000000000001') then raise exception 'Only OpenAI models are supported'; end if;
  insert into public.generation_requests(id,profile_id,image_id,prompt_chain_id,chain_name,steps_snapshot,source_image_url,requested_count)
    values(p_id,auth.uid(),p_image_id,p_chain_id,c.name,snapshot,image_url,p_count) returning * into r;
  return r;
end $$;

-- A lease prevents duplicate paid calls from a double click or two open tabs.
-- An expired lease fails visibly, never silently replays an uncertain provider call.
create function public.claim_prompt_chain_step(p_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.generation_requests;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required' using errcode='42501'; end if;
  select * into r from public.generation_requests where id=p_id and profile_id=auth.uid() and steps_snapshot is not null for update;
  if not found then raise exception 'Run not found or belongs to another user'; end if;
  if r.status <> 'running' then return jsonb_build_object('claimed',false,'run',to_jsonb(r)); end if;
  if r.execution_token is not null then
    if r.execution_started_at < now()-interval '90 seconds' then
      update public.generation_requests set status='failed',error='Execution was interrupted. Start a new run to try again.',completed_at=now(),execution_token=null where id=p_id returning * into r;
    end if;
    return jsonb_build_object('claimed',false,'run',to_jsonb(r));
  end if;
  update public.generation_requests set execution_token=gen_random_uuid(),execution_started_at=now() where id=p_id returning * into r;
  return jsonb_build_object('claimed',true,'run',to_jsonb(r));
end $$;

-- Trace, final media, and successful status commit together, or none do.
create function public.finish_prompt_chain_step(p_id uuid,p_token uuid,p_output text,p_error text,p_system text,p_user text,p_duration integer,p_captions jsonb)
returns public.generation_requests language plpgsql security invoker set search_path='' as $$
declare r public.generation_requests; s jsonb; step_id uuid; is_last boolean; item jsonb; total integer;
begin
  if not public.is_superadmin() then raise exception 'Superadmin access required' using errcode='42501'; end if;
  select * into r from public.generation_requests where id=p_id and profile_id=auth.uid() and steps_snapshot is not null for update;
  if not found then raise exception 'Run not found'; end if;
  if r.status <> 'running' or r.execution_token is null then return r; end if;
  if r.execution_token is distinct from p_token then raise exception 'Execution lease changed'; end if;
  s := r.steps_snapshot->jsonb_array_length(r.step_outputs);
  if s is null then raise exception 'No next step'; end if;
  is_last := jsonb_array_length(r.step_outputs)+1=jsonb_array_length(r.steps_snapshot);
  if p_error is null and (p_output is null or length(trim(p_output))=0 or length(p_output)>30000) then raise exception 'Invalid model output'; end if;
  if p_error is null and is_last then
    if p_captions is null or jsonb_typeof(p_captions)<>'array' then raise exception 'Invalid captions'; end if;
    total := jsonb_array_length(p_captions);
    if total not between 1 and r.requested_count then raise exception 'Invalid caption count'; end if;
    for item in select value from jsonb_array_elements(p_captions) loop
      if jsonb_typeof(item)<>'string' or length(trim(item#>>'{}')) not between 1 and 300 then raise exception 'Invalid caption text'; end if;
    end loop;
  end if;
  select id into step_id from public.prompt_chain_steps where id=(s->>'id')::uuid;
  insert into public.llm_responses(request_id,step_id,model,system_prompt,user_prompt,response,error,duration_ms)
    values(r.id,step_id,s->>'model',p_system,p_user,p_output,p_error,greatest(0,p_duration));
  if p_error is not null then
    update public.generation_requests set status='failed',error=left(p_error,2000),completed_at=now(),execution_token=null where id=r.id returning * into r;
  else
    if is_last then
      insert into public.captions(image_id,content,model,created_by,generation_request_id)
        select r.image_id,value#>>'{}',s->>'model',auth.uid(),r.id from jsonb_array_elements(p_captions);
    end if;
    update public.generation_requests set step_outputs=step_outputs||jsonb_build_array(jsonb_build_object('title',s->>'title','output',p_output,'model',s->>'model','duration_ms',p_duration)),
      execution_token=null, status=case when is_last then 'succeeded' else 'running' end,
      completed_at=case when is_last then now() else null end,caption_count=case when is_last then total else 0 end
      where id=r.id returning * into r;
  end if;
  return r;
end $$;

revoke all on function public.save_prompt_chain(uuid,text,text,integer,jsonb),public.delete_prompt_chain(uuid,integer),public.start_prompt_chain_run(uuid,uuid,uuid,integer),public.claim_prompt_chain_step(uuid),public.finish_prompt_chain_step(uuid,uuid,text,text,text,text,integer,jsonb) from public;
grant execute on function public.save_prompt_chain(uuid,text,text,integer,jsonb),public.delete_prompt_chain(uuid,integer),public.start_prompt_chain_run(uuid,uuid,uuid,integer),public.claim_prompt_chain_step(uuid),public.finish_prompt_chain_step(uuid,uuid,text,text,text,text,integer,jsonb) to authenticated;

commit;
