-- Swap the seeded SpongeBob stills (and their captions and votes) for a funnier set.
-- User uploads (images.created_by is set) are kept.
delete from public.caption_votes
where caption_id in (
  select c.id from public.captions c
  join public.images i on i.id = c.image_id
  where i.created_by is null
);
delete from public.captions
where image_id in (select id from public.images where created_by is null);
delete from public.images where created_by is null;

insert into public.images (id, url, created_datetime_utc)
select v.id::uuid, v.url, now() - interval '1 day' - (v.n * interval '1 minute')
from (values
  (1,  '00000000-0000-4000-8000-000000000101', 'https://i.imgflip.com/1osekd.jpg'),
  (2,  '00000000-0000-4000-8000-000000000102', 'https://i.imgflip.com/321tla.jpg'),
  (3,  '00000000-0000-4000-8000-000000000103', 'https://i.imgflip.com/2a43p7.jpg'),
  (4,  '00000000-0000-4000-8000-000000000104', 'https://i.imgflip.com/45x3ea.png'),
  (5,  '00000000-0000-4000-8000-000000000105', 'https://i.imgflip.com/2yo25m.jpg'),
  (6,  '00000000-0000-4000-8000-000000000106', 'https://i.imgflip.com/2a2eel.jpg'),
  (7,  '00000000-0000-4000-8000-000000000107', 'https://i.imgflip.com/to53r.jpg'),
  (8,  '00000000-0000-4000-8000-000000000108', 'https://i.imgflip.com/1fbiv2.jpg'),
  (9,  '00000000-0000-4000-8000-000000000109', 'https://i.imgflip.com/4m1shl.png'),
  (10, '00000000-0000-4000-8000-000000000110', 'https://i.imgflip.com/27ctrj.jpg'),
  (11, '00000000-0000-4000-8000-000000000111', 'https://i.imgflip.com/geyi6.jpg'),
  (12, '00000000-0000-4000-8000-000000000112', 'https://i.imgflip.com/1pln6k.jpg'),
  (13, '00000000-0000-4000-8000-000000000113', 'https://i.imgflip.com/2yux5g.jpg'),
  (14, '00000000-0000-4000-8000-000000000114', 'https://i.imgflip.com/10ip3k.jpg'),
  (15, '00000000-0000-4000-8000-000000000115', 'https://i.imgflip.com/70bv14.jpg'),
  (16, '00000000-0000-4000-8000-000000000116', 'https://i.imgflip.com/2psjma.jpg')
) as v (n, id, url);

-- One starter caption per image so every page has something to vote on.
insert into public.captions (content, image_id)
select v.content, v.image_id::uuid
from (values
  ('Me reading the syllabus on the first day: "this class seems chill."', '00000000-0000-4000-8000-000000000101'),
  ('When the group project partner says "I thought YOU were doing it."', '00000000-0000-4000-8000-000000000102'),
  ('Me standing outside the fridge at 2 AM. Menacingly.', '00000000-0000-4000-8000-000000000103'),
  ('"We serve food here, sir." Me at the dining hall with a 3-course meal from home.', '00000000-0000-4000-8000-000000000104'),
  ('My bank account after one trip to Trader Joe''s.', '00000000-0000-4000-8000-000000000105'),
  ('Me on the outside vs. me inside when the professor says "cold call."', '00000000-0000-4000-8000-000000000106'),
  ('When the code finally compiles on the first try.', '00000000-0000-4000-8000-000000000107'),
  ('Rereading the email I sent to my professor at 3 AM.', '00000000-0000-4000-8000-000000000108'),
  ('Me kicking out my roommate''s friends at 1 AM before my 9 AM.', '00000000-0000-4000-8000-000000000109'),
  ('Me walking to my 8 AM after "just one more episode."', '00000000-0000-4000-8000-000000000110'),
  ('When the professor asks if there are any questions and you raise your hand to ask what class this is.', '00000000-0000-4000-8000-000000000111'),
  ('Me after reading 40 pages for a class that never mentions them.', '00000000-0000-4000-8000-000000000112'),
  ('Ahoy! Me hearing there''s free pizza at the club meeting.', '00000000-0000-4000-8000-000000000113'),
  ('Me opening my grade after saying "I think I did okay."', '00000000-0000-4000-8000-000000000114'),
  ('When the "quick fix" on main breaks production.', '00000000-0000-4000-8000-000000000115'),
  ('Please, just one extension. I''ll do anything.', '00000000-0000-4000-8000-000000000116')
) as v (content, image_id);
