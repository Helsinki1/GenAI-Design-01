-- User uploads: signed-in users can add images, which the app captions right away.
alter table public.images
  add column if not exists created_by uuid references auth.users (id) on delete set null;

grant insert on public.images to authenticated;

-- Uploaded files live in Storage; images.url points at their public URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Each user may write only inside a folder named after their user id: uploads/<uid>/...
drop policy if exists "Users can upload their own images" on storage.objects;
create policy "Users can upload their own images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Anyone can view uploaded images" on storage.objects;
create policy "Anyone can view uploaded images"
  on storage.objects for select
  using (bucket_id = 'uploads');

-- Image of the Day: re-picked at random each time the user signs in.
alter table public.profiles
  add column if not exists image_of_the_day_id uuid references public.images (id) on delete set null;
