-- Caption gallery schema + sample data.
-- Shape matches app/page.js: captions(id, content, image_id, created_datetime_utc) -> images(url)

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  created_datetime_utc timestamptz not null default now()
);

create table if not exists public.captions (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  image_id uuid references public.images (id) on delete set null,
  created_datetime_utc timestamptz not null default now()
);

create index if not exists captions_created_idx on public.captions (created_datetime_utc desc);
create index if not exists captions_image_idx on public.captions (image_id);

-- RLS stays off for this assignment; grant read access to the Data API roles.
alter table public.images disable row level security;
alter table public.captions disable row level security;
grant select on public.images, public.captions to anon, authenticated;

insert into public.images (id, url) values
  ('00000000-0000-4000-8000-000000000001', 'https://picsum.photos/seed/caption-lab-01/800/600'),
  ('00000000-0000-4000-8000-000000000002', 'https://picsum.photos/seed/caption-lab-02/800/600'),
  ('00000000-0000-4000-8000-000000000003', 'https://picsum.photos/seed/caption-lab-03/800/600'),
  ('00000000-0000-4000-8000-000000000004', 'https://picsum.photos/seed/caption-lab-04/800/600'),
  ('00000000-0000-4000-8000-000000000005', 'https://picsum.photos/seed/caption-lab-05/800/600'),
  ('00000000-0000-4000-8000-000000000006', 'https://picsum.photos/seed/caption-lab-06/800/600'),
  ('00000000-0000-4000-8000-000000000007', 'https://picsum.photos/seed/caption-lab-07/800/600'),
  ('00000000-0000-4000-8000-000000000008', 'https://picsum.photos/seed/caption-lab-08/800/600'),
  ('00000000-0000-4000-8000-000000000009', 'https://picsum.photos/seed/caption-lab-09/800/600'),
  ('00000000-0000-4000-8000-000000000010', 'https://picsum.photos/seed/caption-lab-10/800/600'),
  ('00000000-0000-4000-8000-000000000011', 'https://picsum.photos/seed/caption-lab-11/800/600'),
  ('00000000-0000-4000-8000-000000000012', 'https://picsum.photos/seed/caption-lab-12/800/600')
on conflict (id) do nothing;

-- 30 captions (more than one page of 24) with staggered timestamps so ordering is visible.
insert into public.captions (content, image_id, created_datetime_utc)
select c.content, c.image_id::uuid, now() - (c.n * interval '3 hours')
from (values
  (1,  'When the meeting could have been an email but you still took notes.', '00000000-0000-4000-8000-000000000001'),
  (2,  'Me pretending I understood the assignment.', '00000000-0000-4000-8000-000000000002'),
  (3,  'This is fine. Everything is fine.', '00000000-0000-4000-8000-000000000003'),
  (4,  'The view from my "five more minutes" nap.', '00000000-0000-4000-8000-000000000004'),
  (5,  'Nature''s way of saying "touch grass."', '00000000-0000-4000-8000-000000000005'),
  (6,  'POV: you opened the group chat after 300 unread messages.', '00000000-0000-4000-8000-000000000006'),
  (7,  'Waiting for my code to compile like…', '00000000-0000-4000-8000-000000000007'),
  (8,  'My weekend plans vs. my actual weekend.', '00000000-0000-4000-8000-000000000008'),
  (9,  'The calm before the deadline.', '00000000-0000-4000-8000-000000000009'),
  (10, 'When someone says "quick question" at 4:59 PM.', '00000000-0000-4000-8000-000000000010'),
  (11, 'Professional overthinker, amateur everything else.', '00000000-0000-4000-8000-000000000011'),
  (12, 'Me after one productive hour: time to rest for three days.', '00000000-0000-4000-8000-000000000012'),
  (13, 'Socially distancing from my responsibilities.', '00000000-0000-4000-8000-000000000001'),
  (14, 'It worked on my machine.', '00000000-0000-4000-8000-000000000002'),
  (15, 'Plot twist: the bug was a feature all along.', '00000000-0000-4000-8000-000000000003'),
  (16, 'When the Wi-Fi drops for one second and you lose all hope.', '00000000-0000-4000-8000-000000000004'),
  (17, 'Brain: you should sleep. Also brain: remember that thing from 2014?', '00000000-0000-4000-8000-000000000005'),
  (18, 'Low battery, high ambitions.', '00000000-0000-4000-8000-000000000006'),
  (19, 'Running on coffee and vibes.', '00000000-0000-4000-8000-000000000007'),
  (20, 'The audacity of this Monday.', '00000000-0000-4000-8000-000000000008'),
  (21, 'Me explaining my 47 open browser tabs.', '00000000-0000-4000-8000-000000000009'),
  (22, 'Out of office. Mentally since 2019.', '00000000-0000-4000-8000-000000000010'),
  (23, 'Hydrated, moisturized, still behind on readings.', '00000000-0000-4000-8000-000000000011'),
  (24, 'When autocorrect has a better vocabulary than you.', '00000000-0000-4000-8000-000000000012'),
  (25, 'One does not simply close the fridge without looking twice.', '00000000-0000-4000-8000-000000000001'),
  (26, 'Peak performance: remembering why I walked into the room.', '00000000-0000-4000-8000-000000000002'),
  (27, 'Reply all? In this economy?', '00000000-0000-4000-8000-000000000003'),
  (28, 'Small steps. Very small. Practically standing still.', '00000000-0000-4000-8000-000000000004'),
  (29, 'Living proof that naps are a personality trait.', '00000000-0000-4000-8000-000000000005'),
  (30, 'The face you make when the demo actually works.', '00000000-0000-4000-8000-000000000006')
) as c (n, content, image_id)
where not exists (select 1 from public.captions);
