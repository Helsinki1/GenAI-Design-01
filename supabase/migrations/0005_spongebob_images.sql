-- Replace every image (and its captions and votes) with SpongeBob stills.
delete from public.caption_votes;
delete from public.captions;
delete from public.images;

insert into public.images (id, url, created_datetime_utc)
select v.id::uuid, v.url, now() - (v.n * interval '1 minute')
from (values
  (1,  '00000000-0000-4000-8000-000000000001', 'https://i.imgflip.com/1otk96.jpg'),
  (2,  '00000000-0000-4000-8000-000000000002', 'https://i.imgflip.com/10r5wh.jpg'),
  (3,  '00000000-0000-4000-8000-000000000003', 'https://i.imgflip.com/1jdj7f.jpg'),
  (4,  '00000000-0000-4000-8000-000000000004', 'https://i.imgflip.com/vyxnp.jpg'),
  (5,  '00000000-0000-4000-8000-000000000005', 'https://i.imgflip.com/3i7p.jpg'),
  (6,  '00000000-0000-4000-8000-000000000006', 'https://i.imgflip.com/1y9667.jpg'),
  (7,  '00000000-0000-4000-8000-000000000007', 'https://i.imgflip.com/ba7o0.jpg'),
  (8,  '00000000-0000-4000-8000-000000000008', 'https://i.imgflip.com/25o7wy.jpg'),
  (9,  '00000000-0000-4000-8000-000000000009', 'https://i.imgflip.com/145qvv.jpg'),
  (10, '00000000-0000-4000-8000-000000000010', 'https://i.imgflip.com/392xtu.jpg'),
  (11, '00000000-0000-4000-8000-000000000011', 'https://i.imgflip.com/26br.jpg'),
  (12, '00000000-0000-4000-8000-000000000012', 'https://i.imgflip.com/6zm5.jpg'),
  (13, '00000000-0000-4000-8000-000000000013', 'https://i.imgflip.com/1q7nh7.jpg'),
  (14, '00000000-0000-4000-8000-000000000014', 'https://i.imgflip.com/3txjbc.jpg'),
  (15, '00000000-0000-4000-8000-000000000015', 'https://i.imgflip.com/4djct9.jpg'),
  (16, '00000000-0000-4000-8000-000000000016', 'https://i.imgflip.com/60fx.jpg')
) as v (n, id, url);

-- One starter caption per image so every page has something to vote on.
insert into public.captions (content, image_id)
select v.content, v.image_id::uuid
from (values
  ('When the meeting could have been an email.', '00000000-0000-4000-8000-000000000001'),
  ('Me pretending I understood the assignment.', '00000000-0000-4000-8000-000000000002'),
  ('This is fine. Everything is fine.', '00000000-0000-4000-8000-000000000003'),
  ('When the Wi-Fi drops for one second.', '00000000-0000-4000-8000-000000000004'),
  ('Me after one productive hour.', '00000000-0000-4000-8000-000000000005'),
  ('The face you make when the demo actually works.', '00000000-0000-4000-8000-000000000006'),
  ('Waiting for my code to compile like…', '00000000-0000-4000-8000-000000000007'),
  ('The audacity of this Monday.', '00000000-0000-4000-8000-000000000008'),
  ('Watching everyone else enjoy their weekend.', '00000000-0000-4000-8000-000000000009'),
  ('When someone says "quick question" at 4:59 PM.', '00000000-0000-4000-8000-000000000010'),
  ('Hydrated, moisturized, still behind on readings.', '00000000-0000-4000-8000-000000000011'),
  ('When autocorrect has a better vocabulary than you.', '00000000-0000-4000-8000-000000000012'),
  ('The world''s smallest violin, playing for your late submission.', '00000000-0000-4000-8000-000000000013'),
  ('Me when the professor says the exam is open notes.', '00000000-0000-4000-8000-000000000014'),
  ('Disposing of the evidence of my first-semester code.', '00000000-0000-4000-8000-000000000015'),
  ('Is mayonnaise an instrument? Is HTML a programming language?', '00000000-0000-4000-8000-000000000016')
) as v (content, image_id);
