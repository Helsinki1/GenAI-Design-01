-- Week 7: admin catalogs, prompt configuration, and actual generation traces.
begin;

create table public.llm_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
create table public.llm_models (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  provider_id uuid not null references public.llm_providers(id),
  provider_model_id text not null check (length(trim(provider_model_id)) > 0),
  is_temperature_supported boolean not null default true,
  created_at timestamptz not null default now(),
  unique (provider_id, provider_model_id)
);
create table public.prompt_chains (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);
create table public.prompt_chain_steps (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.prompt_chains(id),
  model_id uuid not null references public.llm_models(id),
  position integer not null check (position > 0),
  system_prompt text not null,
  user_prompt text not null,
  unique (chain_id, position)
);
create table public.prompt_chain_mix (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null unique references public.prompt_chains(id),
  caption_count integer not null default 3 check (caption_count between 0 and 10)
);
create table public.terms (
  id uuid primary key default gen_random_uuid(),
  term text not null unique check (length(trim(term)) > 0),
  definition text not null check (length(trim(definition)) > 0),
  example text,
  priority integer not null default 0 check (priority between 0 and 100),
  created_at timestamptz not null default now()
);
create table public.ai_generation_examples (
  id uuid primary key default gen_random_uuid(),
  image_description text not null check (length(trim(image_description)) > 0),
  caption text not null check (length(trim(caption)) > 0),
  explanation text not null check (length(trim(explanation)) > 0),
  priority integer not null default 0 check (priority between 0 and 100),
  created_at timestamptz not null default now()
);
create table public.allowed_signup_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique check (domain = lower(domain) and domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'),
  created_at timestamptz not null default now()
);
create table public.whitelisted_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  created_at timestamptz not null default now()
);
create table public.generation_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  image_id uuid references public.images(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  caption_count integer not null default 0 check (caption_count >= 0),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table public.llm_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.generation_requests(id),
  step_id uuid references public.prompt_chain_steps(id),
  model text not null,
  system_prompt text not null,
  user_prompt text not null,
  response text,
  error text,
  duration_ms integer not null check (duration_ms >= 0),
  created_at timestamptz not null default now()
);
create index on public.llm_responses(request_id);
create index on public.generation_requests(created_at desc);
alter table public.captions add column generation_request_id uuid references public.generation_requests(id);

-- Existing admins manage catalogs. Participants may read generation configuration
-- used by the server; access-list contents are visible only to admins.
do $$
declare table_name text;
begin
  foreach table_name in array array['llm_providers', 'llm_models', 'terms', 'ai_generation_examples', 'allowed_signup_domains', 'whitelisted_emails'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('create policy "Admins manage records" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', table_name);
  end loop;
  foreach table_name in array array['prompt_chains', 'prompt_chain_steps', 'prompt_chain_mix'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
  end loop;
  foreach table_name in array array['llm_providers', 'llm_models', 'prompt_chains', 'prompt_chain_steps', 'prompt_chain_mix', 'terms', 'ai_generation_examples'] loop
    execute format('create policy "Read generation configuration" on public.%I for select to authenticated using (true)', table_name);
  end loop;
end;
$$;
grant update (caption_count) on public.prompt_chain_mix to authenticated;
create policy "Admins update mix" on public.prompt_chain_mix for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.generation_requests enable row level security;
alter table public.llm_responses enable row level security;
revoke all on public.generation_requests, public.llm_responses from anon, authenticated;
grant select, insert, update on public.generation_requests to authenticated;
grant select, insert on public.llm_responses to authenticated;
create policy "Read own requests or admin" on public.generation_requests for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));
create policy "Create own requests" on public.generation_requests for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy "Complete own requests" on public.generation_requests for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy "Read own responses or admin" on public.llm_responses for select to authenticated
  using ((select public.is_admin()) or exists (select 1 from public.generation_requests r where r.id = request_id and r.profile_id = (select auth.uid())));
create policy "Record own responses" on public.llm_responses for insert to authenticated
  with check (exists (select 1 from public.generation_requests r where r.id = request_id and r.profile_id = (select auth.uid())));

grant update, delete on public.images to authenticated;
create policy "Admins update images" on public.images for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete images" on public.images for delete to authenticated
  using ((select public.is_admin()));
create policy "Admins clean up own failed uploads" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_admin()));

-- Preserve the app's current prompt and default model; mix controls upload count.
insert into public.llm_providers(id, name) values ('70000000-0000-4000-8000-000000000001', 'OpenAI');
insert into public.llm_models(id, name, provider_id, provider_model_id)
values ('70000000-0000-4000-8000-000000000002', 'GPT-4.1 mini', '70000000-0000-4000-8000-000000000001', 'gpt-4.1-mini');
insert into public.prompt_chains(id, name, description)
values ('70000000-0000-4000-8000-000000000003', 'Meme captions', 'Generate short, funny captions for an image.');
insert into public.prompt_chain_steps(chain_id, model_id, position, system_prompt, user_prompt)
values ('70000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000002', 1,
  'You write short, funny, meme-style captions for images. Each caption is under 20 words, with no surrounding quotes. Reply with JSON: {"captions": ["..."]}.',
  'Write {{count}} different captions for this image, each with a different joke.');
insert into public.prompt_chain_mix(chain_id, caption_count) values ('70000000-0000-4000-8000-000000000003', 3);

commit;
